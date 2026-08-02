use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Utc};
use ssh2::Session;
use zeroize::Zeroizing;

use crate::domain::{AppError, AppResult, FtpEntry};

/// One in-flight SFTP-over-SSH connection. `ssh2::Sftp` keeps its parent
/// `Session` (and the underlying `TcpStream`) alive internally via a shared
/// `Arc`, so there's no need to hold onto the `Session` separately here.
pub struct SftpSessionHandle {
    sftp: Mutex<ssh2::Sftp>,
}

pub enum AuthMethod {
    Password(Zeroizing<String>),
    PrivateKey {
        path: String,
        passphrase: Option<Zeroizing<String>>,
    },
    Agent,
}

pub struct ConnectOptions {
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth: AuthMethod,
}

fn ssh_err(e: ssh2::Error) -> AppError {
    AppError::Sftp(e.to_string())
}

/// libssh2's OpenSSL 3.x glue aborts the whole process (not a catchable
/// panic) when asked to decrypt a passphrase-protected key in the legacy
/// PKCS#1/PKCS#8 PEM format — that cipher suite needs OpenSSL's "legacy"
/// provider, which isn't loaded here. Modern `ssh-keygen` (OpenSSH >= 7.8,
/// the default since 2018) writes the "OPENSSH PRIVATE KEY" format instead,
/// which libssh2 decrypts itself and works fine. Refuse the crash-prone
/// combination up front with an actionable message rather than taking the
/// whole app down.
fn reject_crash_prone_encrypted_key(path: &str) -> AppResult<()> {
    let contents = std::fs::read_to_string(path).map_err(AppError::Io)?;
    let trimmed = contents.trim_start();
    let is_openssh_format = trimmed.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----");
    let is_legacy_encrypted =
        contents.contains("Proc-Type: 4,ENCRYPTED") || trimmed.starts_with("-----BEGIN ENCRYPTED PRIVATE KEY-----");
    if is_legacy_encrypted && !is_openssh_format {
        return Err(AppError::Validation(
            "this private key uses an older encrypted format that isn't supported — \
             convert it to the modern OpenSSH format with `ssh-keygen -p -f <keyfile>` \
             (omit -m PEM) and try again"
                .into(),
        ));
    }
    Ok(())
}

pub fn connect(options: ConnectOptions) -> AppResult<SftpSessionHandle> {
    let addr = (options.host.as_str(), options.port as u16)
        .to_socket_addrs()
        .map_err(AppError::Io)?
        .next()
        .ok_or_else(|| AppError::Sftp(format!("could not resolve host '{}'", options.host)))?;
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10)).map_err(AppError::Io)?;

    let mut session = Session::new().map_err(ssh_err)?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(ssh_err)?;

    match options.auth {
        AuthMethod::Password(password) => {
            session
                .userauth_password(&options.username, &password)
                .map_err(ssh_err)?;
        }
        AuthMethod::PrivateKey { path, passphrase } => {
            if passphrase.as_ref().is_some_and(|p| !p.is_empty()) {
                reject_crash_prone_encrypted_key(&path)?;
            }
            session
                .userauth_pubkey_file(
                    &options.username,
                    None,
                    Path::new(&path),
                    passphrase.as_deref().map(String::as_str),
                )
                .map_err(ssh_err)?;
        }
        AuthMethod::Agent => {
            session.userauth_agent(&options.username).map_err(ssh_err)?;
        }
    }

    if !session.authenticated() {
        return Err(AppError::Sftp("authentication failed".into()));
    }

    let sftp = session.sftp().map_err(ssh_err)?;
    Ok(SftpSessionHandle {
        sftp: Mutex::new(sftp),
    })
}

/// No explicit "quit": dropping the handle drops the `Sftp` channel and its
/// underlying `Session`/`TcpStream`, which closes the connection.
pub fn disconnect(_handle: &SftpSessionHandle) -> AppResult<()> {
    Ok(())
}

pub fn pwd(handle: &SftpSessionHandle) -> AppResult<String> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    let path = sftp.realpath(Path::new(".")).map_err(ssh_err)?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn list_dir(handle: &SftpSessionHandle, path: &str) -> AppResult<Vec<FtpEntry>> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    let entries = sftp.readdir(Path::new(path)).map_err(ssh_err)?;
    Ok(entries
        .into_iter()
        .map(|(full_path, stat)| {
            let name = full_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| full_path.to_string_lossy().into_owned());
            FtpEntry {
                name,
                is_dir: stat.is_dir(),
                size: stat.size.unwrap_or(0),
                modified: stat
                    .mtime
                    .and_then(|secs| DateTime::<Utc>::from_timestamp(secs as i64, 0))
                    .map(|dt| dt.to_rfc3339()),
            }
        })
        .collect())
}

pub fn mkdir(handle: &SftpSessionHandle, path: &str) -> AppResult<()> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    sftp.mkdir(Path::new(path), 0o755).map_err(ssh_err)
}

pub fn rmdir(handle: &SftpSessionHandle, path: &str) -> AppResult<()> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    sftp.rmdir(Path::new(path)).map_err(ssh_err)
}

pub fn delete_file(handle: &SftpSessionHandle, path: &str) -> AppResult<()> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    sftp.unlink(Path::new(path)).map_err(ssh_err)
}

pub fn rename(handle: &SftpSessionHandle, from: &str, to: &str) -> AppResult<()> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    sftp.rename(Path::new(from), Path::new(to), None)
        .map_err(ssh_err)
}

/// Downloads `remote_path` to `local_path`, invoking `on_progress(transferred, total)`
/// after every chunk. `total` is `None` when the server doesn't report a size.
pub fn download(
    handle: &SftpSessionHandle,
    remote_path: &str,
    local_path: &Path,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> AppResult<()> {
    let sftp = handle.sftp.lock().expect("sftp poisoned");
    let total = sftp.stat(Path::new(remote_path)).ok().and_then(|s| s.size);
    let mut remote_file = sftp.open(Path::new(remote_path)).map_err(ssh_err)?;
    let mut local_file = std::fs::File::create(local_path).map_err(AppError::Io)?;

    let mut buf = [0u8; 64 * 1024];
    let mut transferred: u64 = 0;
    loop {
        let n = remote_file.read(&mut buf).map_err(AppError::Io)?;
        if n == 0 {
            break;
        }
        local_file.write_all(&buf[..n]).map_err(AppError::Io)?;
        transferred += n as u64;
        on_progress(transferred, total);
    }
    Ok(())
}

/// Uploads `local_path` to `remote_path`, invoking `on_progress(transferred, total)`
/// after every chunk.
pub fn upload(
    handle: &SftpSessionHandle,
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
    let total = Some(metadata.len());

    let sftp = handle.sftp.lock().expect("sftp poisoned");
    let mut local_file = std::fs::File::open(local_path).map_err(AppError::Io)?;
    let mut remote_file = sftp.create(Path::new(remote_path)).map_err(ssh_err)?;

    let mut buf = [0u8; 64 * 1024];
    let mut transferred: u64 = 0;
    loop {
        let n = local_file.read(&mut buf).map_err(AppError::Io)?;
        if n == 0 {
            break;
        }
        remote_file.write_all(&buf[..n]).map_err(AppError::Io)?;
        transferred += n as u64;
        on_progress(transferred, total);
    }
    Ok(())
}
