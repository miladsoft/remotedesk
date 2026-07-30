use serde::Serialize;
use tauri::State;

use crate::application::LockService;
use crate::domain::{AppError, AppResult};
use crate::state::{ensure_unlocked, DbState, LockState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    pub locked: bool,
    pub passphrase_set: bool,
    pub idle_timeout_minutes: i64,
}

#[tauri::command]
pub fn is_locked(db: State<DbState>, lock: State<LockState>) -> AppResult<LockStatus> {
    let conn = db.0.lock().expect("db mutex poisoned");
    Ok(LockStatus {
        locked: *lock.0.lock().expect("lock state mutex poisoned"),
        passphrase_set: LockService::has_passphrase(&conn)?,
        idle_timeout_minutes: LockService::idle_timeout_minutes(&conn)?,
    })
}

#[tauri::command]
pub fn unlock_app(
    db: State<DbState>,
    lock: State<LockState>,
    passphrase: String,
) -> AppResult<()> {
    let conn = db.0.lock().expect("db mutex poisoned");
    if LockService::verify_passphrase(&conn, &passphrase)? {
        *lock.0.lock().expect("lock state mutex poisoned") = false;
        Ok(())
    } else {
        Err(AppError::IncorrectPassphrase)
    }
}

#[tauri::command]
pub fn lock_app(lock: State<LockState>) -> AppResult<()> {
    *lock.0.lock().expect("lock state mutex poisoned") = true;
    Ok(())
}

#[tauri::command]
pub fn set_lock_passphrase(
    db: State<DbState>,
    lock: State<LockState>,
    passphrase: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    LockService::set_passphrase(&conn, &passphrase)
}

#[tauri::command]
pub fn clear_lock_passphrase(db: State<DbState>, lock: State<LockState>) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    LockService::clear_passphrase(&conn)
}

#[tauri::command]
pub fn set_idle_timeout_minutes(
    db: State<DbState>,
    lock: State<LockState>,
    minutes: i64,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    LockService::set_idle_timeout_minutes(&conn, minutes)
}
