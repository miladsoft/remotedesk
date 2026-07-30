use tauri::ipc::Channel;
use tauri::State;

use crate::application::SessionService;
use crate::domain::AppResult;
use crate::infrastructure::pty::{PtyEvent, SessionState};
use crate::state::{ensure_unlocked, DbState, LockState};

#[tauri::command]
pub fn start_session(
    db: State<DbState>,
    lock: State<LockState>,
    sessions: State<SessionState>,
    server_id: String,
    on_event: Channel<PtyEvent>,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    SessionService::start(&conn, sessions.0.clone(), &server_id, on_event)
}

#[tauri::command]
pub fn write_to_session(
    lock: State<LockState>,
    sessions: State<SessionState>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    SessionService::write(&sessions.0, &session_id, &data)
}

#[tauri::command]
pub fn resize_session(
    lock: State<LockState>,
    sessions: State<SessionState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    SessionService::resize(&sessions.0, &session_id, cols, rows)
}

#[tauri::command]
pub fn close_session(
    lock: State<LockState>,
    sessions: State<SessionState>,
    session_id: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    SessionService::close(&sessions.0, &session_id)
}
