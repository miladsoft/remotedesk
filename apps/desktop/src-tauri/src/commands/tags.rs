use tauri::State;

use crate::application::TagService;
use crate::domain::{AppResult, Tag};
use crate::state::{ensure_unlocked, DbState, LockState};

#[tauri::command]
pub fn list_tags(db: State<DbState>, lock: State<LockState>) -> AppResult<Vec<Tag>> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    TagService::list(&conn)
}

#[tauri::command]
pub fn create_tag(db: State<DbState>, lock: State<LockState>, name: String) -> AppResult<Tag> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    TagService::create(&conn, name)
}

#[tauri::command]
pub fn rename_tag(
    db: State<DbState>,
    lock: State<LockState>,
    id: String,
    name: String,
) -> AppResult<Tag> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    TagService::rename(&conn, &id, name)
}

#[tauri::command]
pub fn delete_tag(db: State<DbState>, lock: State<LockState>, id: String) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    TagService::delete(&conn, &id)
}
