use tauri::ipc::Channel;
use tauri::State;

use crate::application::{FtpService, FtpSessionState};
use crate::domain::{AppResult, FtpEntry, FtpTransferEvent};
use crate::state::{ensure_unlocked, DbState, LockState};

#[tauri::command]
pub fn ftp_connect(
    db: State<DbState>,
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    server_id: String,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    FtpService::connect(&conn, sessions.0.clone(), &server_id)
}

#[tauri::command]
pub fn ftp_disconnect(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    FtpService::disconnect(&sessions.0, &session_id)
}

#[tauri::command]
pub fn ftp_pwd(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    FtpService::pwd(&sessions.0, &session_id)
}

#[tauri::command]
pub fn ftp_list(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    path: String,
) -> AppResult<Vec<FtpEntry>> {
    ensure_unlocked(&lock)?;
    FtpService::list(&sessions.0, &session_id, &path)
}

#[tauri::command]
pub fn ftp_mkdir(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    FtpService::mkdir(&sessions.0, &session_id, &path)
}

#[tauri::command]
pub fn ftp_rmdir(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    FtpService::rmdir(&sessions.0, &session_id, &path)
}

#[tauri::command]
pub fn ftp_delete(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    FtpService::delete(&sessions.0, &session_id, &path)
}

#[tauri::command]
pub fn ftp_rename(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    FtpService::rename(&sessions.0, &session_id, &from, &to)
}

#[tauri::command]
pub fn ftp_download(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    remote_path: String,
    local_path: String,
    on_event: Channel<FtpTransferEvent>,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    FtpService::download(sessions.0.clone(), session_id, remote_path, local_path, on_event)
}

#[tauri::command]
pub fn ftp_upload(
    lock: State<LockState>,
    sessions: State<FtpSessionState>,
    session_id: String,
    local_path: String,
    remote_path: String,
    on_event: Channel<FtpTransferEvent>,
) -> AppResult<String> {
    ensure_unlocked(&lock)?;
    FtpService::upload(sessions.0.clone(), session_id, local_path, remote_path, on_event)
}
