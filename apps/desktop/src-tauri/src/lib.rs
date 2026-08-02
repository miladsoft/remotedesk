mod application;
mod commands;
mod domain;
mod infrastructure;
mod protocols;
mod state;

use std::sync::Mutex;

use tauri::Manager;

use application::LockService;
use infrastructure::ftp::FtpSessionState;
use infrastructure::pty::SessionState;
use state::{DbState, LockState};

/// `cargo run`/`tauri dev` launches a bare, unbundled binary, so macOS has no
/// `Info.plist` to read `CFBundleIconFile` from and falls back to a generic
/// Dock icon. Setting `NSApplication.applicationIconImage` directly fixes the
/// Dock icon in dev mode too, matching the packaged `.app` (whose icon comes
/// from `bundle.icon` in `tauri.conf.json` instead).
#[cfg(all(target_os = "macos", debug_assertions))]
fn set_dev_dock_icon() {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else { return };
    let bytes = include_bytes!("../icons/icon.png");
    let data = NSData::with_bytes(bytes);
    let image = NSImage::initWithData(NSImage::alloc(), &data);
    if let Some(image) = image {
        let app = NSApplication::sharedApplication(mtm);
        unsafe { app.setApplicationIconImage(Some(&image)) };
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(all(target_os = "macos", debug_assertions))]
            set_dev_dock_icon();

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = infrastructure::database::open(&data_dir.join("servers.db"))?;

            let starts_locked = LockService::has_passphrase(&conn)?;

            app.manage(DbState(Mutex::new(conn)));
            app.manage(LockState(Mutex::new(starts_locked)));
            app.manage(SessionState::default());
            app.manage(FtpSessionState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::servers::list_servers,
            commands::servers::search_servers,
            commands::servers::get_server,
            commands::servers::create_server,
            commands::servers::update_server,
            commands::servers::delete_server,
            commands::servers::reveal_credential,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::update_group,
            commands::groups::delete_group,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::rename_tag,
            commands::tags::delete_tag,
            commands::lock::is_locked,
            commands::lock::unlock_app,
            commands::lock::lock_app,
            commands::lock::set_lock_passphrase,
            commands::lock::clear_lock_passphrase,
            commands::lock::set_idle_timeout_minutes,
            commands::export_import::export_data,
            commands::export_import::import_data,
            commands::session::start_session,
            commands::session::write_to_session,
            commands::session::resize_session,
            commands::session::close_session,
            commands::ftp::ftp_connect,
            commands::ftp::ftp_disconnect,
            commands::ftp::ftp_pwd,
            commands::ftp::ftp_list,
            commands::ftp::ftp_mkdir,
            commands::ftp::ftp_rmdir,
            commands::ftp::ftp_delete,
            commands::ftp::ftp_rename,
            commands::ftp::ftp_download,
            commands::ftp::ftp_upload,
            commands::local_fs::local_list_dir,
            commands::local_fs::local_mkdir,
            commands::local_fs::local_delete,
            commands::local_fs::local_rename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
