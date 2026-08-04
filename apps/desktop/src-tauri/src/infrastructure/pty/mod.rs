use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult};

/// How many trailing bytes of PTY output we keep around while waiting for a
/// password/passphrase prompt, so the prompt text is still detected even if
/// it arrives split across two reads.
const PROMPT_WINDOW: usize = 256;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    Data { data: String },
    Exited { code: i32 },
}

pub struct PtySessionHandle {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Box<dyn MasterPty + Send>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

pub type SessionMap = Arc<Mutex<HashMap<String, PtySessionHandle>>>;

pub struct SessionState(pub SessionMap);

impl Default for SessionState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

pub struct SpawnOptions {
    pub program: String,
    pub args: Vec<String>,
    /// Working directory for the spawned process, if the caller has one.
    pub cwd: Option<String>,
    /// Written to the pty (followed by a newline) the first time a
    /// password/passphrase prompt is seen in the output, then zeroized.
    /// Never passed via argv or environment variables.
    pub secret_to_inject: Option<Zeroizing<String>>,
}

fn pty_err(e: anyhow::Error) -> AppError {
    AppError::Session(e.to_string())
}

pub fn spawn_session(
    sessions: SessionMap,
    channel: Channel<PtyEvent>,
    options: SpawnOptions,
) -> AppResult<String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(pty_err)?;

    let mut cmd = CommandBuilder::new(&options.program);
    cmd.args(&options.args);
    if let Some(cwd) = &options.cwd {
        cmd.cwd(cwd);
    }

    let child = pair.slave.spawn_command(cmd).map_err(pty_err)?;
    // Drop our copy of the slave side so the master's reader observes EOF
    // once the child truly exits, instead of blocking forever.
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().map_err(pty_err)?;
    let writer = pair.master.take_writer().map_err(pty_err)?;
    let killer = child.clone_killer();

    let session_id = Uuid::new_v4().to_string();
    sessions
        .lock()
        .expect("session map poisoned")
        .insert(
            session_id.clone(),
            PtySessionHandle {
                writer: Mutex::new(writer),
                master: pair.master,
                killer: Mutex::new(killer),
            },
        );

    spawn_reader_thread(
        sessions.clone(),
        session_id.clone(),
        reader,
        channel.clone(),
        options.secret_to_inject,
    );
    spawn_wait_thread(sessions, session_id.clone(), child, channel);

    Ok(session_id)
}

fn spawn_reader_thread(
    sessions: SessionMap,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    channel: Channel<PtyEvent>,
    mut secret_to_inject: Option<Zeroizing<String>>,
) {
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut window: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = &buf[..n];
                    if channel
                        .send(PtyEvent::Data {
                            data: String::from_utf8_lossy(chunk).into_owned(),
                        })
                        .is_err()
                    {
                        break;
                    }

                    if let Some(secret) = secret_to_inject.as_ref() {
                        window.extend_from_slice(chunk);
                        let keep_from = window.len().saturating_sub(PROMPT_WINDOW);
                        window.drain(..keep_from);
                        let lower = String::from_utf8_lossy(&window).to_lowercase();
                        if lower.contains("password:") || lower.contains("passphrase for") {
                            if let Some(handle) =
                                sessions.lock().expect("session map poisoned").get(&session_id)
                            {
                                let mut w = handle.writer.lock().expect("pty writer poisoned");
                                let _ = w.write_all(secret.as_bytes());
                                let _ = w.write_all(b"\n");
                            }
                            secret_to_inject = None;
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_wait_thread(
    sessions: SessionMap,
    session_id: String,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
    channel: Channel<PtyEvent>,
) {
    thread::spawn(move || {
        let status = child.wait();
        sessions.lock().expect("session map poisoned").remove(&session_id);
        let code = status.map(|s| s.exit_code() as i32).unwrap_or(-1);
        let _ = channel.send(PtyEvent::Exited { code });
    });
}

pub fn write_to_session(sessions: &SessionMap, session_id: &str, data: &str) -> AppResult<()> {
    let sessions = sessions.lock().expect("session map poisoned");
    let handle = sessions
        .get(session_id)
        .ok_or_else(|| AppError::NotFound(format!("session '{session_id}'")))?;
    let mut writer = handle.writer.lock().expect("pty writer poisoned");
    writer.write_all(data.as_bytes()).map_err(AppError::Io)
}

pub fn resize_session(sessions: &SessionMap, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
    let sessions = sessions.lock().expect("session map poisoned");
    let handle = sessions
        .get(session_id)
        .ok_or_else(|| AppError::NotFound(format!("session '{session_id}'")))?;
    handle
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(pty_err)
}

pub fn close_session(sessions: &SessionMap, session_id: &str) -> AppResult<()> {
    let mut sessions = sessions.lock().expect("session map poisoned");
    let handle = sessions
        .remove(session_id)
        .ok_or_else(|| AppError::NotFound(format!("session '{session_id}'")))?;
    let result = handle
        .killer
        .lock()
        .expect("pty killer poisoned")
        .kill()
        .map_err(AppError::Io);
    result
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::time::{Duration, Instant};

    use portable_pty::{native_pty_system, CommandBuilder, PtySize};

    /// Exercises the raw portable-pty mechanics this module builds on —
    /// spawn, read, write, resize, kill — independent of Tauri's Channel
    /// (which needs a running app to construct), as a sanity check that
    /// real pty allocation works on this OS/sandbox.
    #[test]
    fn spawns_a_real_pty_process_and_can_read_write_resize_and_kill_it() {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .expect("open pty");

        let cmd = CommandBuilder::new("cat");
        let mut child = pair.slave.spawn_command(cmd).expect("spawn cat");
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().expect("clone reader");
        let mut writer = pair.master.take_writer().expect("take writer");

        pair.master
            .resize(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("resize pty");

        writer.write_all(b"hello-pty-smoke\n").expect("write to pty");

        let mut collected = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut buf = [0u8; 256];
        while Instant::now() < deadline && !contains(&collected, b"hello-pty-smoke") {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => collected.extend_from_slice(&buf[..n]),
                Err(_) => break,
            }
        }

        assert!(
            contains(&collected, b"hello-pty-smoke"),
            "expected echoed input in pty output, got: {:?}",
            String::from_utf8_lossy(&collected)
        );

        child.kill().expect("kill child");
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }
}
