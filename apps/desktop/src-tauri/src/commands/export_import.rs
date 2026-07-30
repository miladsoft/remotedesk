use tauri::State;

use crate::application::{ExportImportService, ImportSummary};
use crate::domain::{AppError, AppResult};
use crate::state::{ensure_unlocked, DbState, LockState};

/// Takes a filesystem path (chosen by the frontend via the native save
/// dialog) rather than raw bytes, and performs the write itself — the
/// frontend never handles the plaintext export document.
#[tauri::command]
pub fn export_data(
    db: State<DbState>,
    lock: State<LockState>,
    path: String,
    include_credentials: bool,
    passphrase: String,
) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    let bytes = ExportImportService::export(&conn, include_credentials, &passphrase)?;
    std::fs::write(&path, bytes).map_err(AppError::Io)
}

#[tauri::command]
pub fn import_data(
    db: State<DbState>,
    lock: State<LockState>,
    path: String,
    passphrase: String,
) -> AppResult<ImportSummary> {
    ensure_unlocked(&lock)?;
    let bytes = std::fs::read(&path).map_err(AppError::Io)?;
    let conn = db.0.lock().expect("db mutex poisoned");
    ExportImportService::import(&conn, &bytes, &passphrase)
}
