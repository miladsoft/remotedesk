use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::{AppError, AppResult, Server};

pub struct ServerRepository;

impl ServerRepository {
    pub fn list(conn: &Connection) -> AppResult<Vec<Server>> {
        let mut stmt = conn.prepare("SELECT * FROM servers ORDER BY name COLLATE NOCASE")?;
        let servers = stmt
            .query_map([], row_to_server)?
            .collect::<Result<Vec<_>, _>>()?;
        attach_tags(conn, servers)
    }

    pub fn search(conn: &Connection, query: &str) -> AppResult<Vec<Server>> {
        let pattern = format!("%{}%", query.to_lowercase());
        let mut stmt = conn.prepare(
            "SELECT * FROM servers
             WHERE lower(name) LIKE ?1
                OR lower(hostname) LIKE ?1
                OR lower(coalesce(description, '')) LIKE ?1
                OR lower(coalesce(username, '')) LIKE ?1
             ORDER BY name COLLATE NOCASE",
        )?;
        let servers = stmt
            .query_map(params![pattern], row_to_server)?
            .collect::<Result<Vec<_>, _>>()?;
        attach_tags(conn, servers)
    }

    pub fn get(conn: &Connection, id: &str) -> AppResult<Server> {
        let mut server = conn
            .query_row("SELECT * FROM servers WHERE id = ?1", params![id], row_to_server)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("server '{id}'")))?;
        server.tag_ids = Self::tag_ids_for(conn, id)?;
        Ok(server)
    }

    pub fn insert(conn: &Connection, server: &Server) -> AppResult<()> {
        conn.execute(
            "INSERT INTO servers (
                id, name, description, hostname, port, protocol, username,
                authentication_type, credential_reference, private_key_path,
                group_id, jump_server_id, working_directory, terminal_profile_id,
                is_favorite, custom_command, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                server.id,
                server.name,
                server.description,
                server.hostname,
                server.port,
                server.protocol,
                server.username,
                server.authentication_type,
                server.credential_reference,
                server.private_key_path,
                server.group_id,
                server.jump_server_id,
                server.working_directory,
                server.terminal_profile_id,
                server.is_favorite,
                server.custom_command,
                server.created_at,
                server.updated_at,
            ],
        )?;
        Self::set_tags(conn, &server.id, &server.tag_ids)?;
        Ok(())
    }

    pub fn update(conn: &Connection, server: &Server) -> AppResult<()> {
        let changed = conn.execute(
            "UPDATE servers SET
                name = ?2, description = ?3, hostname = ?4, port = ?5, protocol = ?6,
                username = ?7, authentication_type = ?8, credential_reference = ?9,
                private_key_path = ?10, group_id = ?11, jump_server_id = ?12,
                working_directory = ?13, terminal_profile_id = ?14, is_favorite = ?15,
                custom_command = ?16, updated_at = ?17
             WHERE id = ?1",
            params![
                server.id,
                server.name,
                server.description,
                server.hostname,
                server.port,
                server.protocol,
                server.username,
                server.authentication_type,
                server.credential_reference,
                server.private_key_path,
                server.group_id,
                server.jump_server_id,
                server.working_directory,
                server.terminal_profile_id,
                server.is_favorite,
                server.custom_command,
                server.updated_at,
            ],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("server '{}'", server.id)));
        }
        Self::set_tags(conn, &server.id, &server.tag_ids)?;
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        let changed = conn.execute("DELETE FROM servers WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("server '{id}'")));
        }
        Ok(())
    }

    pub fn set_tags(conn: &Connection, server_id: &str, tag_ids: &[String]) -> AppResult<()> {
        conn.execute(
            "DELETE FROM server_tags WHERE server_id = ?1",
            params![server_id],
        )?;
        for tag_id in tag_ids {
            conn.execute(
                "INSERT INTO server_tags (server_id, tag_id) VALUES (?1, ?2)",
                params![server_id, tag_id],
            )?;
        }
        Ok(())
    }

    pub fn tag_ids_for(conn: &Connection, server_id: &str) -> AppResult<Vec<String>> {
        let mut stmt = conn.prepare("SELECT tag_id FROM server_tags WHERE server_id = ?1")?;
        let ids = stmt
            .query_map(params![server_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    }
}

fn row_to_server(row: &Row) -> rusqlite::Result<Server> {
    Ok(Server {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        hostname: row.get("hostname")?,
        port: row.get("port")?,
        protocol: row.get("protocol")?,
        username: row.get("username")?,
        authentication_type: row.get("authentication_type")?,
        credential_reference: row.get("credential_reference")?,
        private_key_path: row.get("private_key_path")?,
        group_id: row.get("group_id")?,
        jump_server_id: row.get("jump_server_id")?,
        working_directory: row.get("working_directory")?,
        terminal_profile_id: row.get("terminal_profile_id")?,
        is_favorite: row.get("is_favorite")?,
        tag_ids: Vec::new(),
        custom_command: row.get("custom_command")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn attach_tags(conn: &Connection, mut servers: Vec<Server>) -> AppResult<Vec<Server>> {
    let mut stmt = conn.prepare("SELECT server_id, tag_id FROM server_tags")?;
    let mut by_server: HashMap<String, Vec<String>> = HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (server_id, tag_id) = row?;
        by_server.entry(server_id).or_default().push(tag_id);
    }
    for server in &mut servers {
        if let Some(tag_ids) = by_server.remove(&server.id) {
            server.tag_ids = tag_ids;
        }
    }
    Ok(servers)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{AuthType, Protocol, Tag};
    use crate::infrastructure::database::test_support::open_in_memory;
    use crate::infrastructure::database::TagRepository;

    fn sample_server(id: &str, name: &str) -> Server {
        Server {
            id: id.to_string(),
            name: name.to_string(),
            description: None,
            hostname: "example.test".to_string(),
            port: 22,
            protocol: Protocol::Ssh,
            username: Some("root".to_string()),
            authentication_type: AuthType::Password,
            credential_reference: Some("keychain:abc:password".to_string()),
            private_key_path: None,
            group_id: None,
            jump_server_id: None,
            working_directory: None,
            terminal_profile_id: None,
            is_favorite: false,
            tag_ids: Vec::new(),
            custom_command: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn insert_get_update_delete_round_trip() {
        let conn = open_in_memory();
        let server = sample_server("s1", "Production Web");
        ServerRepository::insert(&conn, &server).unwrap();

        let fetched = ServerRepository::get(&conn, "s1").unwrap();
        assert_eq!(fetched.name, "Production Web");
        assert_eq!(fetched.protocol, Protocol::Ssh);

        let mut updated = fetched;
        updated.name = "Production Web (renamed)".to_string();
        ServerRepository::update(&conn, &updated).unwrap();
        assert_eq!(
            ServerRepository::get(&conn, "s1").unwrap().name,
            "Production Web (renamed)"
        );

        ServerRepository::delete(&conn, "s1").unwrap();
        assert!(ServerRepository::get(&conn, "s1").is_err());
    }

    #[test]
    fn list_and_search_find_by_name_and_hostname() {
        let conn = open_in_memory();
        ServerRepository::insert(&conn, &sample_server("s1", "Database Server")).unwrap();
        ServerRepository::insert(&conn, &sample_server("s2", "Backup Server")).unwrap();

        assert_eq!(ServerRepository::list(&conn).unwrap().len(), 2);
        let results = ServerRepository::search(&conn, "database").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "s1");
    }

    #[test]
    fn tags_are_attached_and_replaced() {
        let conn = open_in_memory();
        TagRepository::insert(&conn, &Tag { id: "t1".into(), name: "prod".into() }).unwrap();
        TagRepository::insert(&conn, &Tag { id: "t2".into(), name: "db".into() }).unwrap();

        let mut server = sample_server("s1", "Db Server");
        server.tag_ids = vec!["t1".to_string(), "t2".to_string()];
        ServerRepository::insert(&conn, &server).unwrap();

        let fetched = ServerRepository::get(&conn, "s1").unwrap();
        assert_eq!(fetched.tag_ids.len(), 2);

        server.tag_ids = vec!["t1".to_string()];
        ServerRepository::update(&conn, &server).unwrap();
        let fetched = ServerRepository::get(&conn, "s1").unwrap();
        assert_eq!(fetched.tag_ids, vec!["t1".to_string()]);
    }

    #[test]
    fn update_of_missing_server_errors() {
        let conn = open_in_memory();
        let server = sample_server("missing", "Ghost");
        assert!(ServerRepository::update(&conn, &server).is_err());
    }
}
