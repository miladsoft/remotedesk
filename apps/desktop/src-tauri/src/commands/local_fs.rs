use tauri::{Manager, State};

use crate::application::LocalFsService;
use crate::domain::{AppError, AppResult, LocalListing};
use crate::state::{ensure_unlocked, LockState};

#[tauri::command]
pub fn local_list_dir(
    app: tauri::AppHandle,
    lock: State<LockState>,
    path: Option<String>,
) -> AppResult<LocalListing> {
    ensure_unlocked(&lock)?;
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    LocalFsService::list_dir(path, &home)
}

#[tauri::command]
pub fn local_mkdir(lock: State<LockState>, path: String) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    LocalFsService::mkdir(&path)
}

#[tauri::command]
pub fn local_delete(lock: State<LockState>, path: String, is_dir: bool) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    LocalFsService::delete(&path, is_dir)
}

#[tauri::command]
pub fn local_rename(lock: State<LockState>, from: String, to: String) -> AppResult<()> {
    ensure_unlocked(&lock)?;
    LocalFsService::rename(&from, &to)
}
