use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use suppaftp::list::File as FtpListFile;
use suppaftp::types::FileType;
use suppaftp::{FtpError, FtpStream};
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult, FtpEntry};

/// One in-flight FTP control connection. Wrapped in its own mutex (rather
/// than relying solely on the outer session-map lock) so a long transfer
/// only blocks other calls against *this* session, not the whole map.
pub struct FtpSessionHandle {
    stream: Mutex<FtpStream>,
}

pub type FtpSessionMap = Arc<Mutex<HashMap<String, Arc<FtpSessionHandle>>>>;

pub struct FtpSessionState(pub FtpSessionMap);

impl Default for FtpSessionState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

pub struct ConnectOptions {
    pub host: String,
    pub port: i64,
    pub username: String,
    /// Empty for anonymous login.
    pub password: Zeroizing<String>,
}

fn ftp_err(e: FtpError) -> AppError {
    AppError::Ftp(e.to_string())
}

fn system_time_to_rfc3339(time: std::time::SystemTime) -> Option<String> {
    Some(DateTime::<Utc>::from(time).to_rfc3339())
}

pub fn connect(options: ConnectOptions) -> AppResult<Arc<FtpSessionHandle>> {
    let addr = format!("{}:{}", options.host, options.port);
    let mut stream = FtpStream::connect(&addr).map_err(ftp_err)?;
    stream
        .login(options.username.as_str(), options.password.as_str())
        .map_err(ftp_err)?;
    stream.transfer_type(FileType::Binary).map_err(ftp_err)?;
    Ok(Arc::new(FtpSessionHandle {
        stream: Mutex::new(stream),
    }))
}

pub fn disconnect(sessions: &FtpSessionMap, session_id: &str) -> AppResult<()> {
    let handle = sessions
        .lock()
        .expect("ftp session map poisoned")
        .remove(session_id)
        .ok_or_else(|| AppError::NotFound(format!("ftp session '{session_id}'")))?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    // Best-effort: the remote end may already have closed the connection.
    let _ = stream.quit();
    Ok(())
}

fn get_handle(sessions: &FtpSessionMap, session_id: &str) -> AppResult<Arc<FtpSessionHandle>> {
    sessions
        .lock()
        .expect("ftp session map poisoned")
        .get(session_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("ftp session '{session_id}'")))
}

pub fn pwd(sessions: &FtpSessionMap, session_id: &str) -> AppResult<String> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    stream.pwd().map_err(ftp_err)
}

pub fn list_dir(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<Vec<FtpEntry>> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    let lines = stream.list(Some(path)).map_err(ftp_err)?;
    Ok(lines
        .iter()
        .filter_map(|line| line.parse::<FtpListFile>().ok())
        .filter(|entry| entry.name() != "." && entry.name() != "..")
        .map(|entry| FtpEntry {
            name: entry.name().to_string(),
            is_dir: entry.is_directory(),
            size: entry.size() as u64,
            modified: system_time_to_rfc3339(entry.modified()),
        })
        .collect())
}

pub fn mkdir(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    stream.mkdir(path).map_err(ftp_err)
}

pub fn rmdir(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    stream.rmdir(path).map_err(ftp_err)
}

pub fn delete_file(sessions: &FtpSessionMap, session_id: &str, path: &str) -> AppResult<()> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    stream.rm(path).map_err(ftp_err)
}

pub fn rename(sessions: &FtpSessionMap, session_id: &str, from: &str, to: &str) -> AppResult<()> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    stream.rename(from, to).map_err(ftp_err)
}

/// Downloads `remote_path` to `local_path`, invoking `on_progress(transferred, total)`
/// after every chunk. `total` is `None` when the server doesn't report a size.
pub fn download(
    sessions: &FtpSessionMap,
    session_id: &str,
    remote_path: &str,
    local_path: &Path,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> AppResult<()> {
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");
    let total = stream.size(remote_path).ok().map(|s| s as u64);

    let mut file = std::fs::File::create(local_path).map_err(AppError::Io)?;
    stream
        .retr(remote_path, |reader| {
            let mut buf = [0u8; 64 * 1024];
            let mut transferred: u64 = 0;
            loop {
                let n = reader
                    .read(&mut buf)
                    .map_err(FtpError::ConnectionError)?;
                if n == 0 {
                    break;
                }
                file.write_all(&buf[..n])
                    .map_err(FtpError::ConnectionError)?;
                transferred += n as u64;
                on_progress(transferred, total);
            }
            Ok(())
        })
        .map_err(ftp_err)
}

/// Uploads `local_path` to `remote_path`, invoking `on_progress(transferred, total)`
/// after every chunk.
pub fn upload(
    sessions: &FtpSessionMap,
    session_id: &str,
    local_path: &Path,
    remote_path: &str,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> AppResult<()> {
    let metadata = std::fs::metadata(local_path).map_err(AppError::Io)?;
    if metadata.is_dir() {
        return Err(AppError::Validation(
            "uploading a directory isn't supported yet — only single files".into(),
        ));
    }
    let handle = get_handle(sessions, session_id)?;
    let mut stream = handle.stream.lock().expect("ftp stream poisoned");

    let total = Some(metadata.len());
    let file = std::fs::File::open(local_path).map_err(AppError::Io)?;
    let mut reader = ProgressReader {
        inner: file,
        transferred: 0,
        total,
        on_progress: &mut on_progress,
    };
    stream.put_file(remote_path, &mut reader).map_err(ftp_err)?;
    Ok(())
}

struct ProgressReader<'a, R: Read> {
    inner: R,
    transferred: u64,
    total: Option<u64>,
    on_progress: &'a mut dyn FnMut(u64, Option<u64>),
}

impl<'a, R: Read> Read for ProgressReader<'a, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        if n > 0 {
            self.transferred += n as u64;
            (self.on_progress)(self.transferred, self.total);
        }
        Ok(n)
    }
}
