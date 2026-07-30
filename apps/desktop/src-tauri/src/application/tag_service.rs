use rusqlite::Connection;
use uuid::Uuid;

use crate::domain::{AppError, AppResult, Tag};
use crate::infrastructure::database::TagRepository;

pub struct TagService;

impl TagService {
    pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
        TagRepository::list(conn)
    }

    pub fn create(conn: &Connection, name: String) -> AppResult<Tag> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation("tag name must not be empty".into()));
        }
        if let Some(existing) = TagRepository::find_by_name(conn, &name)? {
            return Ok(existing);
        }
        let tag = Tag {
            id: Uuid::new_v4().to_string(),
            name,
        };
        TagRepository::insert(conn, &tag)?;
        Ok(tag)
    }

    pub fn rename(conn: &Connection, id: &str, name: String) -> AppResult<Tag> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation("tag name must not be empty".into()));
        }
        let tag = Tag { id: id.to_string(), name };
        TagRepository::update(conn, &tag)?;
        Ok(tag)
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        TagRepository::delete(conn, id)
    }
}
