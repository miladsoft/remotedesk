use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

use rusqlite::Connection;
use tauri::ipc::Channel;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult, AuthType, FtpEntry, FtpTransferEvent, Protocol, Server};
use crate::infrastructure::database::ServerRepository;
use crate::infrastructure::ftp::{self, FtpSessionHandle};
use crate::infrastructure::keychain::KeychainService;
use crate::infrastructure::sftp::{self, SftpSessionHandle};

/// A connected remote file-browsing session: either a plain FTP control
/// connection, or an SFTP channel opened over SSH (reusing that server's own
/// SSH credentials — password, private key, or agent).
pub(crate) enum RemoteFsSession {
    Ftp(FtpSessionHandle),
    Sftp(SftpSessionHandle),
}

pub type RemoteFsSessionMap = Arc<Mutex<HashMap<String, Arc<RemoteFsSession>>>>;

pub struct FtpSessionState(pub RemoteFsSessionMap);

impl Default for FtpSessionState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

fn resolve_secret(server: &Server) -> AppResult<Zeroizing<String>> {
    match &server.credential_reference {
        Some(reference) => KeychainService::account_from_reference(reference)
            .map(KeychainService::get_secret)
            .transpose()?
            .ok_or_else(|| AppError::Keychain("malformed credential reference".into())),
        None => Ok(Zeroizing::new(String::new())),
    }
}

fn get_session(sessions: &RemoteFsSessionMap, session_id: &str) -> AppResult<Arc<RemoteFsSession>> {
    sessions
        .lock()
        .expect("remote fs session map poisoned")
        .get(session_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("file session '{session_id}'")))
}

pub struct FtpService;

impl FtpService {
    /// Connects to `server_id`'s remote filesystem: plain FTP for
    /// `Protocol::Ftp` servers, or SFTP for `Protocol::Ssh`/`Protocol::Sftp`
    /// servers — reusing that server's own SSH credentials, so the user
    /// never has to re-enter anything to browse files on an SSH server.
    pub fn connect(conn: &Connection, sessions: RemoteFsSessionMap, server_id: &str) -> AppResult<String> {
        let server = ServerRepository::get(conn, server_id)?;

        let session = match server.protocol {
            Protocol::Ftp => {
                let username = server
                    .username
                    .clone()
                    .filter(|u| !u.trim().is_empty())
                    .unwrap_or_else(|| "anonymous".to_string());
                let password = resolve_secret(&server)?;
                let handle = ftp::connect(ftp::ConnectOptions {
                    host: server.hostname,
                    port: server.port,
                    username,
                    password,
                })?;
                RemoteFsSession::Ftp(handle)
            }
            Protocol::Ssh | Protocol::Sftp => {
                let username = server
                    .username
                    .clone()
                    .filter(|u| !u.trim().is_empty())
                    .ok_or_else(|| {
                        AppError::Validation("server has no username configured for SFTP".into())
                    })?;

                let auth = match server.authentication_type {
                    AuthType::Password => sftp::AuthMethod::Password(resolve_secret(&server)?),
                    AuthType::PrivateKey => {
                        let path = server
                            .private_key_path
                            .clone()
                            .filter(|p| !p.trim().is_empty())
                            .ok_or_else(|| {
                                AppError::Validation("server has no private key path configured".into())
                            })?;
                        let passphrase = if server.credential_reference.is_some() {
                            Some(resolve_secret(&server)?).filter(|s| !s.is_empty())
                        } else {
                            None
                        };
                        sftp::AuthMethod::PrivateKey { path, passphrase }
                    }
                    AuthType::Agent => sftp::AuthMethod::Agent,
                };

                let handle = sftp::connect(sftp::ConnectOptions {
                    host: server.hostname,
                    port: server.port,
                    username,
                    auth,
                })?;
                RemoteFsSession::Sftp(handle)
            }
            other => {
                return Err(AppError::Validation(format!(
                    "browsing files isn't supported for protocol '{}'",
                    other.as_str()
                )));
            }
        };

        let session_id = Uuid::new_v4().to_string();
        sessions
            .lock()
            .expect("remote fs session map poisoned")
            .insert(session_id.clone(), Arc::new(session));
        Ok(session_id)
    }

    pub fn disconnect(sessions: &RemoteFsSessionMap, session_id: &str) -> AppResult<()> {
        let session = sessions
            .lock()
            .expect("remote fs session map poisoned")
            .remove(session_id)
            .ok_or_else(|| AppError::NotFound(format!("file session '{session_id}'")))?;
        match session.as_ref() {
            RemoteFsSession::Ftp(handle) => ftp::disconnect(handle),
            RemoteFsSession::Sftp(handle) => sftp::disconnect(handle),
        }
    }

    pub fn pwd(sessions: &RemoteFsSessionMap, session_id: &str) -> AppResult<String> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::pwd(h),
            RemoteFsSession::Sftp(h) => sftp::pwd(h),
        }
    }

    pub fn list(sessions: &RemoteFsSessionMap, session_id: &str, path: &str) -> AppResult<Vec<FtpEntry>> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::list_dir(h, path),
            RemoteFsSession::Sftp(h) => sftp::list_dir(h, path),
        }
    }

    pub fn mkdir(sessions: &RemoteFsSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::mkdir(h, path),
            RemoteFsSession::Sftp(h) => sftp::mkdir(h, path),
        }
    }

    pub fn rmdir(sessions: &RemoteFsSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::rmdir(h, path),
            RemoteFsSession::Sftp(h) => sftp::rmdir(h, path),
        }
    }

    pub fn delete(sessions: &RemoteFsSessionMap, session_id: &str, path: &str) -> AppResult<()> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::delete_file(h, path),
            RemoteFsSession::Sftp(h) => sftp::delete_file(h, path),
        }
    }

    pub fn rename(sessions: &RemoteFsSessionMap, session_id: &str, from: &str, to: &str) -> AppResult<()> {
        match get_session(sessions, session_id)?.as_ref() {
            RemoteFsSession::Ftp(h) => ftp::rename(h, from, to),
            RemoteFsSession::Sftp(h) => sftp::rename(h, from, to),
        }
    }

    /// Spawns a background download, returning a transfer id immediately.
    /// Progress/completion/failure stream over `channel`.
    pub fn download(
        sessions: RemoteFsSessionMap,
        session_id: String,
        remote_path: String,
        local_path: String,
        channel: Channel<FtpTransferEvent>,
    ) -> AppResult<String> {
        let transfer_id = Uuid::new_v4().to_string();
        thread::spawn(move || {
            let result = (|| -> AppResult<()> {
                let session = get_session(&sessions, &session_id)?;
                let local = PathBuf::from(local_path);
                match session.as_ref() {
                    RemoteFsSession::Ftp(h) => ftp::download(h, &remote_path, &local, |transferred, total| {
                        let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                    }),
                    RemoteFsSession::Sftp(h) => sftp::download(h, &remote_path, &local, |transferred, total| {
                        let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                    }),
                }
            })();
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
        sessions: RemoteFsSessionMap,
        session_id: String,
        local_path: String,
        remote_path: String,
        channel: Channel<FtpTransferEvent>,
    ) -> AppResult<String> {
        let transfer_id = Uuid::new_v4().to_string();
        thread::spawn(move || {
            let result = (|| -> AppResult<()> {
                let session = get_session(&sessions, &session_id)?;
                let local = PathBuf::from(local_path);
                match session.as_ref() {
                    RemoteFsSession::Ftp(h) => ftp::upload(h, &local, &remote_path, |transferred, total| {
                        let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                    }),
                    RemoteFsSession::Sftp(h) => sftp::upload(h, &local, &remote_path, |transferred, total| {
                        let _ = channel.send(FtpTransferEvent::Progress { transferred, total });
                    }),
                }
            })();
            let _ = channel.send(match result {
                Ok(()) => FtpTransferEvent::Completed,
                Err(e) => FtpTransferEvent::Failed { message: e.to_string() },
            });
        });
        Ok(transfer_id)
    }
}
