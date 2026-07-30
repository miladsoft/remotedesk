use tauri::State;

use crate::application::GroupService;
use crate::domain::{AppResult, ServerGroup, ServerGroupInput};
use crate::state::{ensure_unlocked, DbState, LockState};

#[tauri::command]
pub fn list_groups(db: State<DbState>, lock: State<LockState>) -> AppResult<Vec<ServerGroup>> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    GroupService::list(&conn)
}

#[tauri::command]
pub fn create_group(
    db: State<DbState>,
    lock: State<LockState>,
    input: ServerGroupInput,
) -> AppResult<ServerGroup> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    GroupService::create(&conn, input)
}

#[tauri::command]
pub fn update_group(
    db: State<DbState>,
    lock: State<LockState>,
    id: String,
    input: ServerGroupInput,
) -> AppResult<ServerGroup> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    GroupService::update(&conn, &id, input)
}

#[tauri::command]
pub fn delete_group(db: State<DbState>, lock: State<LockState>, id: String) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    GroupService::delete(&conn, &id)
}
