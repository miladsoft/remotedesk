use rusqlite::Connection;
use tauri::ipc::Channel;

use crate::domain::{AppError, AppResult, Protocol};
use crate::infrastructure::database::ServerRepository;
use crate::infrastructure::keychain::KeychainService;
use crate::infrastructure::pty::{self, PtyEvent, SessionMap, SpawnOptions};
use crate::protocols::ssh;

pub struct SessionService;

impl SessionService {
    /// Starts an interactive session for `server_id`, streaming its pty
    /// output over `channel`. Only the SSH protocol is wired to a real
    /// process in this build; other protocols report a clear "not yet
    /// supported" error instead of silently doing nothing.
    pub fn start(
        conn: &Connection,
        sessions: SessionMap,
        server_id: &str,
        channel: Channel<PtyEvent>,
    ) -> AppResult<String> {
        let server = ServerRepository::get(conn, server_id)?;

        if server.protocol != Protocol::Ssh {
            return Err(AppError::Validation(format!(
                "connecting via {} is not supported yet in this build — only SSH is available",
                server.protocol.as_str()
            )));
        }

        let secret = if server.authentication_type.expects_secret() {
            match &server.credential_reference {
                Some(reference) => KeychainService::account_from_reference(reference)
                    .map(KeychainService::get_secret)
                    .transpose()?,
                None => None,
            }
        } else {
            None
        };

        let jump_chain = ssh::resolve_jump_chain(conn, &server)?;
        let args = ssh::build_args(&server, &jump_chain);

        pty::spawn_session(
            sessions,
            channel,
            SpawnOptions {
                program: "ssh".to_string(),
                args,
                secret_to_inject: secret,
            },
        )
    }

    pub fn write(sessions: &SessionMap, session_id: &str, data: &str) -> AppResult<()> {
        pty::write_to_session(sessions, session_id, data)
    }

    pub fn resize(sessions: &SessionMap, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        pty::resize_session(sessions, session_id, cols, rows)
    }

    pub fn close(sessions: &SessionMap, session_id: &str) -> AppResult<()> {
        pty::close_session(sessions, session_id)
    }
}
