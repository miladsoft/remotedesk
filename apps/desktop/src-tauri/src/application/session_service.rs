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
    /// output over `channel`. SSH, local shell and custom command protocols
    /// are wired to a real process in this build; other protocols report a
    /// clear "not yet supported" error instead of silently doing nothing.
    pub fn start(
        conn: &Connection,
        sessions: SessionMap,
        server_id: &str,
        channel: Channel<PtyEvent>,
    ) -> AppResult<String> {
        let server = ServerRepository::get(conn, server_id)?;

        let options = match server.protocol {
            Protocol::Ssh => {
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

                SpawnOptions {
                    program: "ssh".to_string(),
                    args,
                    cwd: None,
                    secret_to_inject: secret,
                }
            }
            Protocol::LocalShell => SpawnOptions {
                program: default_shell(),
                args: Vec::new(),
                cwd: server.working_directory.clone(),
                secret_to_inject: None,
            },
            Protocol::CustomCommand => {
                let command = server
                    .custom_command
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if command.is_empty() {
                    return Err(AppError::Validation(
                        "this server has no command configured".into(),
                    ));
                }
                let (program, args) = shell_command(&command);
                SpawnOptions {
                    program,
                    args,
                    cwd: server.working_directory.clone(),
                    secret_to_inject: None,
                }
            }
            other => {
                return Err(AppError::Validation(format!(
                    "connecting via {} is not supported yet in this build",
                    other.as_str()
                )));
            }
        };

        pty::spawn_session(sessions, channel, options)
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

/// Resolves the user's preferred interactive shell for `Protocol::LocalShell`.
fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

/// Wraps a `Protocol::CustomCommand` command line in the platform shell so
/// the user can type an ordinary shell command (pipes, env vars, etc).
fn shell_command(command: &str) -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        (
            "cmd.exe".to_string(),
            vec!["/C".to_string(), command.to_string()],
        )
    }
    #[cfg(not(windows))]
    {
        (
            "/bin/sh".to_string(),
            vec!["-c".to_string(), command.to_string()],
        )
    }
}
