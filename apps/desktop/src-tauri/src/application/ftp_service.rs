use std::path::PathBuf;
use std::thread;

use rusqlite::Connection;
use tauri::ipc::Channel;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult, FtpEntry, FtpTransferEvent, Protocol};
use crate::infrastructure::database::ServerRepository;
use crate::infrastructure::ftp::{self, ConnectOptions, FtpSessionMap};
use crate::infrastructure::keychain::KeychainService;

pub struct FtpService;

impl FtpService {
    /// Connects to `server_id` over plain FTP, reusing its stored hostname/
    /// port/username/password, and returns the new session's id.
    pub fn connect(conn: &Connection, sessions: FtpSessionMap, server_id: &str) -> AppResult<String> {
        let server = ServerRepository::get(conn, server_id)?;

        if server.protocol != Protocol::Ftp {
            return Err(AppError::Validation(format!(
                "server protocol is '{}', not 'ftp'",
                server.protocol.as_str()
            )));
        }

        let username = server
            .username
            .clone()
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| "anonymous".to_string());

        let password = if server.authentication_type.expects_secret() {
            match &server.credential_reference {
                Some(reference) => KeychainService::account_from_reference(reference)
                    .map(KeychainService::get_secret)
                    .transpose()?
                    .unwrap_or_default(),
                None => Zeroizing::new(String::new()),
            }
        } else {
            Zeroizing::new(String::new())
        };

        let handle = ftp::connect(ConnectOptions {
            host: server.hostname,
            port: server.port,
            username,
            password,
        })?;

        let session_id = Uuid::new_v4().to_string();
        sessions
            .lock()
            .expect("ftp session map poisoned")
            .insert(session_id.clone(), handle);
        Ok(session_id)
    }

    pub fn disconnect(sessions: &FtpSessionMap, session_id: &str) -> AppResult<()> {
        ftp::disconnect(sessions, session_id)
    }

    pub fn pwd(sessions: &FtpSessionMap, session_id: &str) -> AppResult<String> {
        ftp::pwd(sessions, session_id)
    }

    pub fn list(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<Vec<FtpEntry>> {
        ftp::list_dir(sessions, session_id, path)
    }

    pub fn mkdir(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        ftp::mkdir(sessions, session_id, path)
    }

    pub fn rmdir(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        ftp::rmdir(sessions, session_id, path)
    }

    pub fn delete(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        ftp::delete_file(sessions, session_id, path)
    }

    pub fn rename(sessions: &FtpSessionMap, session_id: &str, from: &str, to: &str) -> AppResult<()> {
        ftp::rename(sessions, session_id, from, to)
    }

    /// Spawns a background download, returning a transfer id immediately.
    /// Progress/completion/failure stream over `channel`.
    pub fn download(
        sessions: FtpSessionMap,
        session_id: String,
        remote_path: String,
        local_path: String,
        channel: Channel<FtpTransferEvent>,
    ) -> AppResult<String> {
        let transfer_id = Uuid::new_v4().to_string();
        thread::spawn(move || {
            let result = ftp::download(
                &sessions,
                &session_id,
                &remote_path,
                &PathBuf::from(local_path),
                |transferred, total| {
                    let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                },
            );
            let _ = channel.send(match result {
                Ok(()) => FtpTransferEvent::Completed,
                Err(e) => FtpTransferEvent::Failed { message: e.to_string() },
            });
        });
        Ok(transfer_id)
    }

    /// Spawns a background upload, returning a transfer id immediately.
    /// Progress/completion/failure stream over `channel`.
    pub fn upload(
        sessions: FtpSessionMap,
        session_id: String,
        local_path: String,
        remote_path: String,
        channel: Channel<FtpTransferEvent>,
    ) -> AppResult<String> {
        let transfer_id = Uuid::new_v4().to_string();
        thread::spawn(move || {
            let result = ftp::upload(
                &sessions,
                &session_id,
                &PathBuf::from(local_path),
                &remote_path,
                |transferred, total| {
                    let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                },
            );
            let _ = channel.send(match result {
                Ok(()) => FtpTransferEvent::Completed,
                Err(e) => FtpTransferEvent::Failed { message: e.to_string() },
            });
        });
        Ok(transfer_id)
    }
}
