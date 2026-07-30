use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::{AppError, AppResult, Tag};

pub struct TagRepository;

impl TagRepository {
    pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
        let mut stmt = conn.prepare("SELECT * FROM tags ORDER BY name COLLATE NOCASE")?;
        let tags = stmt
            .query_map([], row_to_tag)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    pub fn find_by_name(conn: &Connection, name: &str) -> AppResult<Option<Tag>> {
        Ok(conn
            .query_row(
                "SELECT * FROM tags WHERE lower(name) = lower(?1)",
                params![name],
                row_to_tag,
            )
            .optional()?)
    }

    pub fn insert(conn: &Connection, tag: &Tag) -> AppResult<()> {
        conn.execute(
            "INSERT INTO tags (id, name) VALUES (?1, ?2)",
            params![tag.id, tag.name],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, tag: &Tag) -> AppResult<()> {
        let changed = conn.execute(
            "UPDATE tags SET name = ?2 WHERE id = ?1",
            params![tag.id, tag.name],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("tag '{}'", tag.id)));
        }
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        let changed = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("tag '{id}'")));
        }
        Ok(())
    }
}

fn row_to_tag(row: &Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::test_support::open_in_memory;

    #[test]
    fn insert_find_update_delete_round_trip() {
        let conn = open_in_memory();
        TagRepository::insert(&conn, &Tag { id: "t1".into(), name: "prod".into() }).unwrap();

        assert_eq!(
            TagRepository::find_by_name(&conn, "PROD").unwrap().map(|t| t.id),
            Some("t1".to_string())
        );

        TagRepository::update(&conn, &Tag { id: "t1".into(), name: "production".into() }).unwrap();
        assert_eq!(TagRepository::list(&conn).unwrap()[0].name, "production");

        TagRepository::delete(&conn, "t1").unwrap();
        assert!(TagRepository::list(&conn).unwrap().is_empty());
    }

    #[test]
    fn duplicate_names_are_rejected_by_the_unique_constraint() {
        let conn = open_in_memory();
        TagRepository::insert(&conn, &Tag { id: "t1".into(), name: "prod".into() }).unwrap();
        let result = TagRepository::insert(&conn, &Tag { id: "t2".into(), name: "prod".into() });
        assert!(result.is_err());
    }
}
