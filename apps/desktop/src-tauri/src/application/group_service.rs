use rusqlite::Connection;
use uuid::Uuid;

use crate::domain::{AppError, AppResult, ServerGroup, ServerGroupInput};
use crate::infrastructure::database::GroupRepository;

pub struct GroupService;

impl GroupService {
    pub fn list(conn: &Connection) -> AppResult<Vec<ServerGroup>> {
        GroupRepository::list(conn)
    }

    pub fn create(conn: &Connection, input: ServerGroupInput) -> AppResult<ServerGroup> {
        validate(conn, &input, None)?;
        let group = ServerGroup {
            id: Uuid::new_v4().to_string(),
            parent_id: input.parent_id,
            name: input.name,
            description: input.description,
            sort_order: input.sort_order,
        };
        GroupRepository::insert(conn, &group)?;
        Ok(group)
    }

    pub fn update(conn: &Connection, id: &str, input: ServerGroupInput) -> AppResult<ServerGroup> {
        validate(conn, &input, Some(id))?;
        let group = ServerGroup {
            id: id.to_string(),
            parent_id: input.parent_id,
            name: input.name,
            description: input.description,
            sort_order: input.sort_order,
        };
        GroupRepository::update(conn, &group)?;
        Ok(group)
    }

    pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
        GroupRepository::delete(conn, id)
    }
}

fn validate(conn: &Connection, input: &ServerGroupInput, self_id: Option<&str>) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("group name must not be empty".into()));
    }
    if let Some(parent_id) = &input.parent_id {
        if Some(parent_id.as_str()) == self_id {
            return Err(AppError::Validation("a group cannot be its own parent".into()));
        }
        GroupRepository::get(conn, parent_id)?;
    }
    Ok(())
}
