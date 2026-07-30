use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::{AppError, AppResult, ServerGroup};

pub struct GroupRepository;

impl GroupRepository {
    pub fn list(conn: &Connection) -> AppResult<Vec<ServerGroup>> {
        let mut stmt =
            conn.prepare("SELECT * FROM server_groups ORDER BY sort_order, name COLLATE NOCASE")?;
        let groups = stmt
            .query_map([], row_to_group)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(groups)
    }

    pub fn get(conn: &Connection, id: &str) -> AppResult<ServerGroup> {
        conn.query_row(
            "SELECT * FROM server_groups WHERE id = ?1",
            params![id],
            row_to_group,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("group '{id}'")))
    }

    pub fn insert(conn: &Connection, group: &ServerGroup) -> AppResult<()> {
        conn.execute(
            "INSERT INTO server_groups (id, parent_id, name, description, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                group.id,
                group.parent_id,
                group.name,
                group.description,
                group.sort_order
            ],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, group: &ServerGroup) -> AppResult<()> {
        let changed = conn.execute(
            "UPDATE server_groups SET parent_id = ?2, name = ?3, description = ?4, sort_order = ?5
             WHERE id = ?1",
            params![
                group.id,
                group.parent_id,
                group.name,
                group.description,
                group.sort_order
            ],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("group '{}'", group.id)));
        }
        Ok(())
    }

    /// Deletes a group, orphaning (not deleting) any child groups or servers
    /// that referenced it.
    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        conn.execute(
            "UPDATE server_groups SET parent_id = NULL WHERE parent_id = ?1",
            params![id],
        )?;
        conn.execute(
            "UPDATE servers SET group_id = NULL WHERE group_id = ?1",
            params![id],
        )?;
        let changed = conn.execute("DELETE FROM server_groups WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("group '{id}'")));
        }
        Ok(())
    }
}

fn row_to_group(row: &Row) -> rusqlite::Result<ServerGroup> {
    Ok(ServerGroup {
        id: row.get("id")?,
        parent_id: row.get("parent_id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        sort_order: row.get("sort_order")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::server_repo::ServerRepository;
    use super::super::test_support::open_in_memory;
    use crate::domain::{AuthType, Protocol, Server};

    fn sample_group(id: &str, parent_id: Option<&str>) -> ServerGroup {
        ServerGroup {
            id: id.to_string(),
            parent_id: parent_id.map(str::to_string),
            name: format!("Group {id}"),
            description: None,
            sort_order: 0,
        }
    }

    #[test]
    fn insert_update_delete_round_trip() {
        let conn = open_in_memory();
        GroupRepository::insert(&conn, &sample_group("g1", None)).unwrap();

        let mut fetched = GroupRepository::get(&conn, "g1").unwrap();
        fetched.name = "Renamed".to_string();
        GroupRepository::update(&conn, &fetched).unwrap();
        assert_eq!(GroupRepository::get(&conn, "g1").unwrap().name, "Renamed");

        GroupRepository::delete(&conn, "g1").unwrap();
        assert!(GroupRepository::get(&conn, "g1").is_err());
    }

    #[test]
    fn deleting_a_group_orphans_children_and_servers_instead_of_deleting_them() {
        let conn = open_in_memory();
        GroupRepository::insert(&conn, &sample_group("parent", None)).unwrap();
        GroupRepository::insert(&conn, &sample_group("child", Some("parent"))).unwrap();

        let server = Server {
            id: "s1".into(),
            name: "Server".into(),
            description: None,
            hostname: "h".into(),
            port: 22,
            protocol: Protocol::Ssh,
            username: None,
            authentication_type: AuthType::Agent,
            credential_reference: None,
            private_key_path: None,
            group_id: Some("parent".to_string()),
            jump_server_id: None,
            working_directory: None,
            terminal_profile_id: None,
            is_favorite: false,
            tag_ids: Vec::new(),
            created_at: "now".into(),
            updated_at: "now".into(),
        };
        ServerRepository::insert(&conn, &server).unwrap();

        GroupRepository::delete(&conn, "parent").unwrap();

        assert_eq!(GroupRepository::get(&conn, "child").unwrap().parent_id, None);
        assert_eq!(ServerRepository::get(&conn, "s1").unwrap().group_id, None);
    }
}
