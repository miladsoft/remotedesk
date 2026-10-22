//! Remote Desktop (RDP) connections.
//!
//! RemoteDesk doesn't embed an RDP renderer; it hands the connection to the
//! operating system's own Remote Desktop client and passes the stored
//! credentials along as safely as that client allows:
//!
//! - **Windows** — the password is staged in Windows Credential Manager under
//!   `TERMSRV/<host>` (exactly where `mstsc` saves credentials itself), then
//!   `mstsc` opens a generated `.rdp` file. The staged credential is removed
//!   again shortly after launch, once `mstsc` has picked it up.
//! - **macOS** — the generated `.rdp` file is opened with the default `.rdp`
//!   handler (Windows App / Microsoft Remote Desktop). Neither accepts a
//!   password from another app, so the caller puts it on the clipboard for
//!   the user to paste (see `RdpService::PASSWORD_VIA_CLIPBOARD`).
//! - **Linux** — FreeRDP is launched directly. FreeRDP 3 receives all of its
//!   arguments, password included, over stdin (`/args-from:stdin`), so the
//!   password never appears in the process list; FreeRDP 2 lacks that, so it
//!   gets `/p:` on the command line, which FreeRDP masks in its own argv
//!   right after parsing.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::domain::{AppError, AppResult, Protocol, Server};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpLaunch {
    /// Human-readable name of the client that was launched.
    pub client: String,
    /// True when the password was put on the clipboard for the user to paste,
    /// because this platform's client can't be handed it directly.
    pub password_copied: bool,
}

pub struct RdpService;

impl RdpService {
    /// Whether this platform's RDP client needs the password pasted by hand.
    pub const PASSWORD_VIA_CLIPBOARD: bool = cfg!(target_os = "macos");

    /// Launches the native RDP client for `server`. `work_dir` is where the
    /// generated `.rdp` file is written (it never contains the password).
    /// Returns the human-readable name of the client that was started.
    pub fn launch(server: &Server, password: Option<&str>, work_dir: &Path) -> AppResult<String> {
        if server.protocol != Protocol::Rdp {
            return Err(AppError::Validation(format!(
                "\"{}\" is not a Remote Desktop server",
                server.name
            )));
        }
        let target = RdpTarget::from_server(server)?;
        let password = password.filter(|p| !p.is_empty());
        platform::launch(server, &target, password, work_dir)
    }
}

/// Validated connection details. Everything here ends up in a line-based
/// `.rdp` file or a client's argument list, so control characters (newlines
/// in particular, which could smuggle extra `.rdp` settings in) are rejected.
#[derive(Debug)]
struct RdpTarget {
    host: String,
    port: u16,
    username: Option<String>,
}

impl RdpTarget {
    fn from_server(server: &Server) -> AppResult<Self> {
        let host = server.hostname.trim();
        if host.is_empty() {
            return Err(AppError::Validation("hostname must not be empty".into()));
        }
        if host.chars().any(|c| c.is_control() || c.is_whitespace()) {
            return Err(AppError::Validation(
                "hostname contains invalid characters".into(),
            ));
        }
        let port = u16::try_from(server.port)
            .ok()
            .filter(|p| *p != 0)
            .ok_or_else(|| AppError::Validation("port must be between 1 and 65535".into()))?;
        let username = server
            .username
            .as_deref()
            .map(str::trim)
            .filter(|u| !u.is_empty())
            .map(str::to_string);
        if username
            .as_deref()
            .is_some_and(|u| u.chars().any(char::is_control))
        {
            return Err(AppError::Validation(
                "username contains invalid characters".into(),
            ));
        }
        Ok(Self {
            host: host
                .trim_start_matches('[')
                .trim_end_matches(']')
                .to_string(),
            port,
            username,
        })
    }

    /// `host:port`, with IPv6 literals bracketed as RDP clients expect.
    fn address(&self) -> String {
        if self.host.contains(':') {
            format!("[{}]:{}", self.host, self.port)
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }
}

fn rdp_file_contents(target: &RdpTarget) -> String {
    let mut lines = vec![
        format!("full address:s:{}", target.address()),
        "screen mode id:i:2".to_string(),
        "use multimon:i:0".to_string(),
        "dynamic resolution:i:1".to_string(),
        "smart sizing:i:1".to_string(),
        "session bpp:i:32".to_string(),
        "redirectclipboard:i:1".to_string(),
        "audiomode:i:0".to_string(),
        "autoreconnection enabled:i:1".to_string(),
        "authentication level:i:2".to_string(),
        "enablecredsspsupport:i:1".to_string(),
        "prompt for credentials:i:0".to_string(),
    ];
    if let Some(username) = &target.username {
        lines.push(format!("username:s:{username}"));
    }
    let mut contents = lines.join("\r\n");
    contents.push_str("\r\n");
    contents
}

#[cfg_attr(not(any(target_os = "windows", target_os = "macos")), allow(dead_code))]
fn write_rdp_file(work_dir: &Path, server: &Server, target: &RdpTarget) -> AppResult<PathBuf> {
    fs::create_dir_all(work_dir)?;
    let file_stem: String = server
        .id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    let path = work_dir.join(format!("{file_stem}.rdp"));
    fs::write(&path, rdp_file_contents(target))?;
    Ok(path)
}

#[cfg(target_os = "windows")]
mod platform {
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::Duration;

    use zeroize::Zeroizing;

    use super::{write_rdp_file, RdpTarget};
    use crate::domain::{AppError, AppResult, Server};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// How long the staged credential stays in Credential Manager — plenty of
    /// time for `mstsc` to read it, which it does as it starts connecting.
    const CREDENTIAL_TTL: Duration = Duration::from_secs(30);

    fn cmdkey() -> Command {
        let mut command = Command::new("cmdkey");
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        command
    }

    pub fn launch(
        server: &Server,
        target: &RdpTarget,
        password: Option<&str>,
        work_dir: &Path,
    ) -> AppResult<String> {
        let rdp_file = write_rdp_file(work_dir, server, target)?;

        if let (Some(username), Some(password)) = (target.username.as_deref(), password) {
            let credential_target = format!("TERMSRV/{}", target.host);
            let password_arg = Zeroizing::new(format!("/pass:{password}"));
            let status = cmdkey()
                .arg(format!("/generic:{credential_target}"))
                .arg(format!("/user:{username}"))
                .arg(password_arg.as_str())
                .status()
                .map_err(|e| AppError::Rdp(format!("could not run cmdkey: {e}")))?;
            if !status.success() {
                return Err(AppError::Rdp(
                    "could not hand the password to Remote Desktop Connection".into(),
                ));
            }
            thread::spawn(move || {
                thread::sleep(CREDENTIAL_TTL);
                let _ = cmdkey()
                    .arg(format!("/delete:{credential_target}"))
                    .status();
            });
        }

        Command::new("mstsc").arg(&rdp_file).spawn().map_err(|e| {
            AppError::Rdp(format!("could not start Remote Desktop Connection: {e}"))
        })?;
        Ok("Remote Desktop Connection".to_string())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;
    use std::process::Command;

    use super::{write_rdp_file, RdpTarget};
    use crate::domain::{AppError, AppResult, Server};

    pub fn launch(
        server: &Server,
        target: &RdpTarget,
        _password: Option<&str>,
        work_dir: &Path,
    ) -> AppResult<String> {
        let rdp_file = write_rdp_file(work_dir, server, target)?;
        let output = Command::new("open")
            .arg(&rdp_file)
            .output()
            .map_err(|e| AppError::Rdp(format!("could not open the .rdp file: {e}")))?;
        if !output.status.success() {
            return Err(AppError::Rdp(
                "no Remote Desktop app is installed — install \"Windows App\" from the Mac App Store and try again"
                    .into(),
            ));
        }
        Ok("Windows App".to_string())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod platform {
    use std::env;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::thread;

    use zeroize::{Zeroize, Zeroizing};

    use super::RdpTarget;
    use crate::domain::{AppError, AppResult, Server};

    /// FreeRDP client binaries in order of preference. Distros ship FreeRDP 3
    /// either with a `3` suffix or under the plain name, so the major version
    /// is read from the binary itself rather than guessed from its name.
    const FREERDP_BINARIES: &[&str] = &[
        "xfreerdp3",
        "sdl-freerdp3",
        "wlfreerdp3",
        "xfreerdp",
        "sdl-freerdp",
        "wlfreerdp",
    ];

    fn find_in_path(name: &str) -> Option<PathBuf> {
        use std::os::unix::fs::PermissionsExt;
        env::split_paths(&env::var_os("PATH")?)
            .map(|dir| dir.join(name))
            .find(|path| {
                path.metadata()
                    .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            })
    }

    /// Major version from `/version` output ("This is FreeRDP version 3.5.1 ...").
    fn major_version(binary: &Path) -> Option<u32> {
        let output = Command::new(binary)
            .arg("/version")
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let (_, rest) = text.split_once("version ")?;
        rest.split('.').next()?.trim().parse().ok()
    }

    pub fn launch(
        server: &Server,
        target: &RdpTarget,
        password: Option<&str>,
        _work_dir: &Path,
    ) -> AppResult<String> {
        let username = target.username.as_deref().ok_or_else(|| {
            AppError::Validation(
                "set a username for this server to connect over Remote Desktop".into(),
            )
        })?;
        let password = password.ok_or_else(|| {
            AppError::Validation(
                "save a password for this server first — FreeRDP can't ask for one when started from RemoteDesk"
                    .into(),
            )
        })?;
        let binary = FREERDP_BINARIES
            .iter()
            .find_map(|name| find_in_path(name))
            .ok_or_else(|| {
                AppError::Rdp(
                    "FreeRDP isn't installed — install it with your package manager (e.g. `freerdp3-x11` or `freerdp2-x11`) and try again"
                        .into(),
                )
            })?;
        let is_v3 = match major_version(&binary) {
            Some(major) => major >= 3,
            None => binary.to_string_lossy().ends_with('3'),
        };

        let title: String = server
            .name
            .chars()
            .map(|c| if c.is_control() { ' ' } else { c })
            .collect();
        let mut args = vec![
            format!("/v:{}", target.address()),
            format!("/u:{username}"),
            format!("/t:{title}"),
            "/dynamic-resolution".to_string(),
            "+clipboard".to_string(),
            "+auto-reconnect".to_string(),
            if is_v3 { "/cert:tofu" } else { "/cert-tofu" }.to_string(),
        ];

        let mut command = Command::new(&binary);
        command.stdout(Stdio::null()).stderr(Stdio::null());

        let child = if is_v3 {
            if password.contains(['\n', '\r']) {
                return Err(AppError::Validation(
                    "passwords containing line breaks aren't supported by FreeRDP".into(),
                ));
            }
            // `/args-from:stdin` can't be combined with other arguments: every
            // argument goes over stdin, one per line.
            let mut password_arg = format!("/p:{password}");
            args.push(password_arg.clone());
            password_arg.zeroize();
            let stdin_payload = Zeroizing::new(args.join("\n") + "\n");
            if let Some(arg) = args.last_mut() {
                arg.zeroize();
            }
            let mut child = command
                .arg("/args-from:stdin")
                .stdin(Stdio::piped())
                .spawn()
                .map_err(|e| AppError::Rdp(format!("could not start FreeRDP: {e}")))?;
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(stdin_payload.as_bytes()).map_err(|e| {
                    AppError::Rdp(format!("could not pass credentials to FreeRDP: {e}"))
                })?;
            }
            child
        } else {
            let password_arg = Zeroizing::new(format!("/p:{password}"));
            command
                .args(&args)
                .arg(password_arg.as_str())
                .stdin(Stdio::null())
                .spawn()
                .map_err(|e| AppError::Rdp(format!("could not start FreeRDP: {e}")))?
        };

        // Reap the client when it exits so it doesn't linger as a zombie.
        thread::spawn(move || {
            let mut child = child;
            let _ = child.wait();
        });
        Ok("FreeRDP".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AuthType;

    fn rdp_server(hostname: &str, port: i64, username: Option<&str>) -> Server {
        Server {
            id: "6f1c2b9e-0000-4000-8000-000000000001".to_string(),
            name: "Win box".to_string(),
            description: None,
            hostname: hostname.to_string(),
            port,
            protocol: Protocol::Rdp,
            username: username.map(str::to_string),
            authentication_type: AuthType::Password,
            credential_reference: None,
            private_key_path: None,
            group_id: None,
            jump_server_id: None,
            working_directory: None,
            terminal_profile_id: None,
            is_favorite: false,
            tag_ids: Vec::new(),
            custom_command: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn rdp_file_has_address_and_username() {
        let server = rdp_server("win.example.test", 3390, Some("CORP\\alice"));
        let contents = rdp_file_contents(&RdpTarget::from_server(&server).unwrap());
        assert!(contents.contains("full address:s:win.example.test:3390\r\n"));
        assert!(contents.contains("username:s:CORP\\alice\r\n"));
        assert!(!contents.contains("password"));
    }

    #[test]
    fn ipv6_hosts_are_bracketed() {
        let target = RdpTarget::from_server(&rdp_server("fe80::1", 3389, None)).unwrap();
        assert_eq!(target.address(), "[fe80::1]:3389");
        let bracketed = RdpTarget::from_server(&rdp_server("[fe80::1]", 3389, None)).unwrap();
        assert_eq!(bracketed.address(), "[fe80::1]:3389");
    }

    #[test]
    fn rejects_newline_injection() {
        assert!(
            RdpTarget::from_server(&rdp_server("host\nalternate shell:s:cmd", 3389, None)).is_err()
        );
        assert!(
            RdpTarget::from_server(&rdp_server("host", 3389, Some("bob\r\nshell:s:x"))).is_err()
        );
    }

    #[test]
    fn rejects_out_of_range_port() {
        assert!(RdpTarget::from_server(&rdp_server("host", 0, None)).is_err());
        assert!(RdpTarget::from_server(&rdp_server("host", 70000, None)).is_err());
    }

    #[test]
    fn rejects_non_rdp_servers() {
        let mut server = rdp_server("host", 22, None);
        server.protocol = Protocol::Ssh;
        assert!(RdpService::launch(&server, None, Path::new("/nonexistent")).is_err());
    }
}
