use tauri::ipc::Channel;
use tauri::State;

use crate::application::{ConnectionService, SessionService};
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

/// Types `server_id`'s stored password (or key passphrase) into a session,
/// e.g. at a `sudo` prompt. The secret goes straight from the keychain to the
/// pty; it never passes through the webview. No Enter is sent, so the user
/// stays in control of submitting it.
#[tauri::command]
pub fn send_credential_to_session(
    db: State<DbState>,
    lock: State<LockState>,
    sessions: State<SessionState>,
    server_id: String,
    session_id: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let secret = {
        let conn = db.0.lock().expect("db mutex poisoned");
        ConnectionService::secret(&conn, &server_id)?
    };
    SessionService::write(&sessions.0, &session_id, &secret)
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
