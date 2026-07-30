mod application;
mod commands;
mod domain;
mod infrastructure;
mod protocols;
mod state;

use std::sync::Mutex;

use tauri::Manager;

use application::LockService;
use infrastructure::pty::SessionState;
use state::{DbState, LockState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = infrastructure::database::open(&data_dir.join("servers.db"))?;

            let starts_locked = LockService::has_passphrase(&conn)?;

            app.manage(DbState(Mutex::new(conn)));
            app.manage(LockState(Mutex::new(starts_locked)));
            app.manage(SessionState::default());
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
