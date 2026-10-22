use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult};

/// How long a copied secret stays on the system clipboard before it's wiped,
/// the same convention password managers use.
pub const SECRET_CLEAR_AFTER: Duration = Duration::from_secs(30);

/// Writes `secret` to the system clipboard straight from the Rust side (the
/// webview never sees it), then wipes it again after `SECRET_CLEAR_AFTER` —
/// but only if the clipboard still holds that same secret, so anything the
/// user copied in the meantime is left alone.
pub fn copy_secret<R: Runtime>(app: &AppHandle<R>, secret: Zeroizing<String>) -> AppResult<()> {
    app.clipboard()
        .write_text(secret.as_str())
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(SECRET_CLEAR_AFTER);
        let clipboard = app.clipboard();
        let still_ours = clipboard
            .read_text()
            .map(Zeroizing::new)
            .is_ok_and(|current| *current == *secret);
        if still_ours {
            if let Err(e) = clipboard.clear() {
                tracing::warn!("failed to clear copied secret from clipboard: {e}");
            }
        }
    });
    Ok(())
}
