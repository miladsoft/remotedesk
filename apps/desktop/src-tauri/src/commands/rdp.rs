use tauri::{AppHandle, Manager, State};

use crate::application::{ConnectionService, RdpLaunch, RdpService};
use crate::domain::{AppError, AppResult};
use crate::infrastructure::clipboard;
use crate::state::{ensure_unlocked, DbState, LockState};

/// Opens `server_id` in the platform's native Remote Desktop client, handing
/// it the stored password (directly where the client allows it, otherwise
/// via the clipboard — see `RdpService`).
#[tauri::command]
pub fn rdp_connect(
    app: AppHandle,
    db: State<DbState>,
    lock: State<LockState>,
    server_id: String,
) -> AppResult<RdpLaunch> {
    ensure_unlocked(&lock)?;
    let (server, password) = {
        let conn = db.0.lock().expect("db mutex poisoned");
        let server = ConnectionService::get(&conn, &server_id)?;
        let password = match server.credential_reference {
            Some(_) => Some(ConnectionService::secret(&conn, &server_id)?),
            None => None,
        };
        (server, password)
    };
    let password = password.filter(|p| !p.is_empty());

    let work_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Rdp(format!("could not resolve the cache directory: {e}")))?
        .join("rdp");

    let mut password_copied = false;
    if RdpService::PASSWORD_VIA_CLIPBOARD {
        if let Some(password) = &password {
            clipboard::copy_secret(&app, password.clone())?;
            password_copied = true;
        }
    }

    let client = RdpService::launch(&server, password.as_deref().map(String::as_str), &work_dir)?;
    Ok(RdpLaunch {
        client,
        password_copied,
    })
}
