use tauri::State;

use crate::application::ConnectionService;
use crate::domain::{AppResult, Server, ServerInput};
use crate::state::{ensure_unlocked, DbState, LockState};

#[tauri::command]
pub fn list_servers(db: State<DbState>, lock: State<LockState>) -> AppResult<Vec<Server>> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::list(&conn)
}

#[tauri::command]
pub fn search_servers(
    db: State<DbState>,
    lock: State<LockState>,
    query: String,
) -> AppResult<Vec<Server>> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::search(&conn, &query)
}

#[tauri::command]
pub fn get_server(db: State<DbState>, lock: State<LockState>, id: String) -> AppResult<Server> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::get(&conn, &id)
}

#[tauri::command]
pub fn create_server(
    db: State<DbState>,
    lock: State<LockState>,
    input: ServerInput,
) -> AppResult<Server> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::create(&conn, input)
}

#[tauri::command]
pub fn update_server(
    db: State<DbState>,
    lock: State<LockState>,
    id: String,
    input: ServerInput,
) -> AppResult<Server> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::update(&conn, &id, input)
}

#[tauri::command]
pub fn delete_server(db: State<DbState>, lock: State<LockState>, id: String) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ConnectionService::delete(&conn, &id)
}

#[tauri::command]
pub fn reveal_credential(
    db: State<DbState>,
    lock: State<LockState>,
    id: String,
    passphrase: String,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    if !crate::application::LockService::verify_passphrase(&conn, &passphrase)? {
        return Err(crate::domain::AppError::IncorrectPassphrase);
    }
    ConnectionService::reveal_credential(&conn, &id)
}
