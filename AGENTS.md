# Recommended Technical Architecture

You should build this as a **cross-platform, local-first server connection manager** for macOS, Windows, and Linux.

The best stack is:

| Layer             | Recommended technology                                               |
| ----------------- | -------------------------------------------------------------------- |
| Desktop framework | **Tauri 2**                                                          |
| Backend/core      | **Rust**                                                             |
| Frontend          | **React + TypeScript**                                               |
| UI system         | **Tailwind CSS + shadcn/ui**                                         |
| File database     | **SQLite / SQLCipher**                                               |
| Password storage  | **macOS Keychain, Windows Credential Manager, Linux Secret Service** |
| Terminal UI       | **xterm.js**                                                         |
| Terminal process  | **Rust PTY + system OpenSSH**                                        |
| Build system      | **Cargo + pnpm + Vite**                                              |
| Packaging         | DMG, MSI/NSIS, AppImage/DEB/RPM                                      |

Tauri supports macOS, Windows, and Linux from one codebase. Its frontend can use React or another web framework, while native operations are implemented in Rust. It uses WKWebView on macOS, WebView2 on Windows, and WebKitGTK on Linux. ([Tauri][1])

## My strongest recommendation

Build it with:

```text
Tauri 2
Rust
React
TypeScript
SQLite + SQLCipher
OS Keychain
OpenSSH
xterm.js
```

Do **not** build it entirely with Electron unless your team has no Rust experience. Electron is easier initially, but Tauri is a better foundation for a professional system-management application because the sensitive logic, process execution, database access, and operating-system integration can remain inside a compiled Rust backend.

## How it should differ from Remmina

Remmina is a GTK-based remote connection client with integrated support for protocols such as RDP, VNC, SPICE, NX, XDMCP, SSH, and EXEC. Its architecture is strongly connected to GTK and the Linux desktop ecosystem. ([GitLab][2])

You should not try to port Remmina directly to macOS. Instead, reproduce its important concepts:

* Saved server profiles
* Connection groups
* Multiple protocols
* Search and filtering
* Tabs and sessions
* SSH tunnelling
* Credentials management
* Import and export
* Protocol plugins

But implement them with a modern cross-platform architecture.

# Proposed application architecture

```text
┌─────────────────────────────────────────────┐
│              React / TypeScript UI          │
│                                             │
│ Dashboard │ Server List │ Terminal │ Files  │
└──────────────────────┬──────────────────────┘
                       │ Tauri IPC
┌──────────────────────▼──────────────────────┐
│                 Rust Application Core       │
│                                             │
│ Connection Manager                          │
│ Session Manager                             │
│ Credential Vault                            │
│ Protocol Adapter Registry                   │
│ PTY Manager                                 │
│ Import / Export Service                     │
│ Audit and Logging Service                   │
└──────────────┬──────────────────┬───────────┘
               │                  │
┌──────────────▼─────────┐  ┌────▼──────────────┐
│ SQLCipher Database     │  │ Operating System  │
│                        │  │                   │
│ Profiles               │  │ OpenSSH           │
│ Groups                 │  │ Keychain          │
│ Settings               │  │ Terminal / PTY    │
│ History                │  │ External clients  │
└────────────────────────┘  └───────────────────┘
```

## Database recommendation

Use **SQLite** because it is a single-file embedded database and requires no database server or administration. SQLite explicitly identifies desktop application file formats as an appropriate use case. ([SQLite][3])

For your application, use:

```text
servers.db
```

For stronger protection, use **SQLCipher**, which adds AES-256 encryption, tamper detection, key derivation, and encrypted database pages to SQLite. ([GitHub][4])

However, the most important rule is:

> Never store plaintext passwords directly in the database.

The database should only contain a credential reference:

```text
credential_ref = "server:production-01:ssh"
```

The actual password should be stored in:

* macOS: Keychain
* Windows: Credential Manager
* Linux: Secret Service-compatible keyring

Rust’s keyring ecosystem supports platform-independent access to password stores on macOS, Windows, and Unix-like systems. ([Docs.rs][5])

You could also use Tauri Stronghold for an encrypted portable vault, but for the first version I recommend native operating-system credential stores. Stronghold is useful later for encrypted export files or a portable vault. ([Tauri][6])

# Suggested database structure

## `servers`

```sql
CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    hostname TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    username TEXT,
    authentication_type TEXT NOT NULL,
    credential_reference TEXT,
    private_key_path TEXT,
    group_id TEXT,
    jump_server_id TEXT,
    working_directory TEXT,
    terminal_profile_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## `server_groups`

```sql
CREATE TABLE server_groups (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);
```

## `tags`

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
```

## `server_tags`

```sql
CREATE TABLE server_tags (
    server_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (server_id, tag_id)
);
```

## `connection_history`

```sql
CREATE TABLE connection_history (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    protocol TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL,
    error_summary TEXT
);
```

Do not save terminal output by default. Terminal output may contain passwords, tokens, database connection strings, customer information, or private commands.

# Connection methods

## 1. SSH

SSH should be the first and most complete protocol.

Use the installed **OpenSSH client** instead of creating your own SSH implementation in the first version. OpenSSH supports remote shells, command execution, file transfer, SSH agents, tunnelling, and several authentication methods. ([OpenSSH][7])

Example command generated internally:

```bash
ssh \
  -p 22 \
  -i "/Users/milad/.ssh/id_ed25519" \
  -J jump-user@jump.example.com:22 \
  milad@192.168.1.20
```

OpenSSH supports `ProxyJump` for connecting through one or multiple jump servers and `ControlMaster` for sharing an existing connection between sessions. ([Man Pages][8])

Your SSH adapter should support:

* Password authentication
* SSH private keys
* SSH agent
* Passphrase-protected keys
* Jump servers
* Multiple jump servers
* Local port forwarding
* Remote port forwarding
* Dynamic SOCKS forwarding
* Connection timeout
* Keepalive
* Compression
* Environment variables
* Startup commands
* Working directory
* Host-key verification

Never automatically add:

```bash
-o StrictHostKeyChecking=no
```

The application must show the server fingerprint on the first connection and detect when it changes.

## 2. Embedded terminal

For a professional interface, include an embedded terminal instead of always opening Apple Terminal, Windows Terminal, or a Linux terminal window.

Use:

```text
xterm.js
        ↕
Tauri events
        ↕
Rust PTY manager
        ↕
ssh process
```

xterm.js provides the terminal rendering and terminal-sequence handling, while the Rust backend manages the real pseudoterminal process. ([Xterm][9])

A Rust PTY abstraction such as `portable-pty`, originating from the WezTerm project, can manage native terminal processes. ([Docs.rs][10])

This gives you:

* Multiple terminal tabs
* Split terminals
* Copy and paste
* Search
* Resize support
* Terminal themes
* Command snippets
* Reconnect
* Session status
* Full-screen terminal
* Keyboard shortcut management

## 3. External terminal mode

Also provide:

```text
Connection mode:
○ Embedded terminal
○ System terminal
○ Custom terminal application
```

For example:

* macOS: Terminal, iTerm2, Warp, or configured application
* Windows: Windows Terminal or PowerShell
* Linux: GNOME Terminal, Konsole, Xfce Terminal, or configured application

Be careful on macOS: GUI applications do not necessarily inherit the same `$PATH` configured in `.zshrc` or other shell startup files. Therefore, detect binaries using absolute paths or maintain an application-specific executable-path setting. ([Tauri][11])

## 4. SFTP

After SSH, add an integrated two-panel SFTP file manager:

```text
Local computer             Remote server
────────────────          ─────────────────
Documents                  /var/www
Downloads                  /home/milad
Projects                   /opt/apps
```

Support:

* Upload and download
* Drag and drop
* Rename
* Delete with confirmation
* Permissions
* Ownership display
* Transfer queue
* Resume transfer
* Conflict resolution
* Hidden files
* Text file preview
* Remote editor integration

OpenSSH includes SFTP support, and SFTP operates over encrypted SSH transport. ([OpenSSH][12])

## 5. RDP

For the first version, launch an installed RDP client using a generated temporary connection profile.

For a later fully integrated RDP implementation, use **FreeRDP** through a Rust FFI layer. FreeRDP is an open implementation of the Remote Desktop Protocol under the Apache license. ([FreeRDP][13])

Embedded RDP is significantly more difficult than SSH because it includes:

* Video/frame rendering
* Keyboard and mouse translation
* Clipboard synchronization
* Audio
* Multiple monitors
* Dynamic resolution
* File and drive redirection
* Printer redirection
* Network Level Authentication
* Certificate handling

Therefore, do not make embedded RDP part of the first milestone.

## 6. VNC

Follow the same strategy:

* Version 1: launch a configured external VNC client
* Later version: integrate LibVNCClient through a native adapter

Keep every protocol behind the same adapter interface.

# Protocol plugin design

Create a Rust interface similar to:

```rust
pub trait ProtocolAdapter {
    fn protocol_id(&self) -> &'static str;

    fn validate_profile(
        &self,
        profile: &ConnectionProfile,
    ) -> Result<(), ConnectionError>;

    fn test_connection(
        &self,
        profile: &ConnectionProfile,
    ) -> Result<TestResult, ConnectionError>;

    fn connect(
        &self,
        profile: &ConnectionProfile,
        credentials: ResolvedCredentials,
    ) -> Result<SessionHandle, ConnectionError>;

    fn disconnect(
        &self,
        session: &SessionHandle,
    ) -> Result<(), ConnectionError>;

    fn capabilities(&self) -> ProtocolCapabilities;
}
```

Initial adapters:

```text
protocols/
├── ssh/
├── sftp/
├── local_shell/
├── external_rdp/
├── external_vnc/
└── custom_command/
```

Later:

```text
protocols/
├── embedded_rdp/
├── embedded_vnc/
├── serial/
├── kubernetes/
├── docker/
└── database/
```

# Security requirements

The security model should be decided before building the UI.

Mandatory requirements:

1. **No plaintext passwords in SQLite**
2. **No passwords in command-line arguments**
3. **No passwords in environment variables**
4. **Use SSH agent and SSH keys whenever possible**
5. **Verify SSH host fingerprints**
6. **Clear secrets from memory after use**
7. **Automatically lock the application**
8. **Require system authentication to reveal a password**
9. **Redact secrets from logs**
10. **Never record terminal output by default**
11. **Use parameterized SQL queries**
12. **Sign all production releases**
13. **Verify application updates cryptographically**
14. **Restrict Tauri permissions and IPC commands**
15. **Do not allow arbitrary shell command construction from the frontend**

The React frontend must never receive the actual password unless absolutely necessary. The frontend sends a server ID to Rust, and Rust resolves the credential directly from the keychain.

```text
Frontend:
connect(server_id)

Rust:
1. Load profile
2. Read credential reference
3. Resolve secret from OS keychain
4. Start the connection
5. Clear secret from memory
```

# Recommended user interface

## Main window

```text
┌─────────────────────────────────────────────────────────────┐
│ Search servers...                 + New Connection    ⚙     │
├───────────────┬─────────────────────────────────────────────┤
│ Favorites     │ Production Servers                          │
│               │                                             │
│ Production    │ ● SBC Web Server       SSH   185.x.x.x      │
│ Development   │ ● Database Server      SSH   10.0.0.20      │
│ Customers     │ ● Windows Server       RDP   10.0.0.30      │
│ Oman          │ ● Backup Server        SSH   backup.sbc.om  │
│ Iran          │                                             │
│               │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Terminal 1 │ Terminal 2 │ Transfers │ Connection Details    │
└─────────────────────────────────────────────────────────────┘
```

Important features:

* Global search
* Command palette
* Favorites
* Nested groups
* Tags
* Grid and list views
* Connection health indicator
* Recently used servers
* Quick connect
* Duplicate profile
* Bulk import
* Encrypted backup
* Keyboard navigation
* Dark and light modes
* macOS-style sidebar
* System tray/menu bar
* Multiple windows
* Session restore without restoring passwords

# Application folder structure

```text
server-manager/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── connections/
│       │   │   ├── credentials/
│       │   │   ├── terminal/
│       │   │   ├── transfers/
│       │   │   └── settings/
│       │   ├── stores/
│       │   └── routes/
│       └── src-tauri/
│           ├── src/
│           │   ├── application/
│           │   ├── domain/
│           │   ├── infrastructure/
│           │   │   ├── database/
│           │   │   ├── keychain/
│           │   │   ├── pty/
│           │   │   └── processes/
│           │   ├── protocols/
│           │   │   ├── ssh/
│           │   │   ├── sftp/
│           │   │   ├── rdp/
│           │   │   └── vnc/
│           │   ├── commands/
│           │   └── lib.rs
│           ├── migrations/
│           ├── Cargo.toml
│           └── tauri.conf.json
├── packages/
│   ├── ui/
│   ├── types/
│   └── validation/
├── docs/
│   ├── architecture/
│   ├── security/
│   └── protocols/
├── pnpm-workspace.yaml
└── README.md
```

# Development roadmap

## Phase 1 — Secure foundation

* Tauri project
* React interface
* SQLite migrations
* Keychain integration
* Server CRUD
* Groups and tags
* Search
* Encrypted export/import
* Application locking

## Phase 2 — SSH terminal

* OpenSSH detection
* Embedded terminal
* PTY management
* Password, key and agent authentication
* Host fingerprints
* Jump servers
* Tunnels
* Reconnect
* Multiple tabs

## Phase 3 — File management

* SFTP browser
* Transfer queue
* Drag and drop
* Permissions
* Remote file editing
* Upload/download progress

## Phase 4 — Professional operations

* Connection testing
* Ping and port checks
* Server status
* Command snippets
* Bulk command execution with explicit confirmation
* Audit history
* Backup and restore
* Import from SSH config
* Import from Remmina profiles

## Phase 5 — Remote desktop

* External RDP/VNC launchers
* FreeRDP integration
* VNC integration
* Clipboard and display management
* Full-screen and multi-monitor support

## Phase 6 — Distribution

Produce:

```text
macOS:
- Apple Silicon DMG
- Intel DMG
- Universal application if required

Windows:
- MSI
- NSIS installer

Linux:
- AppImage
- DEB
- RPM
```

Tauri provides platform-specific packaging and supports automated release pipelines and application updates. Production macOS and Windows applications should be code-signed; macOS distribution also normally requires notarization. ([Tauri][14])

# Final decision

Use this exact architecture:

```text
Application:
Tauri 2

Backend:
Rust

Frontend:
React + TypeScript + Tailwind CSS + shadcn/ui

Database:
SQLCipher-encrypted SQLite file

Secrets:
OS Keychain with credential references in SQLite

Terminal:
xterm.js + Rust PTY

SSH:
System OpenSSH process

SFTP:
OpenSSH initially, native Rust adapter later

RDP:
External launcher first, FreeRDP integration later

VNC:
External launcher first, native integration later

Architecture:
Local-first, plugin-based, offline-capable, security-first
```

This gives you a realistic path to a professional **Remmina-style application designed primarily for macOS**, while still producing native installers for Windows and Linux from the same project.

[1]: https://v2.tauri.app/ "Tauri 2.0 | Tauri"
[2]: https://gitlab.com/Remmina/Remmina/-/blob/v1.2.0-rcgit.22/README.md?utm_source=chatgpt.com "README.md · v1.2.0-rcgit.22 · Remmina ..."
[3]: https://sqlite.org/whentouse.html?utm_source=chatgpt.com "Appropriate Uses For SQLite"
[4]: https://github.com/sqlcipher/sqlcipher "GitHub - sqlcipher/sqlcipher: SQLCipher is a standalone fork of SQLite that adds 256 bit AES encryption of database files and other security features. · GitHub"
[5]: https://docs.rs/keyring/latest/x86_64-linux-android/keyring/ "keyring - Rust"
[6]: https://v2.tauri.app/ko/plugin/stronghold/?utm_source=chatgpt.com "Stronghold | Tauri"
[7]: https://www.openssh.com/?utm_source=chatgpt.com "OpenSSH"
[8]: https://man.openbsd.org/ssh_config?utm_source=chatgpt.com "ssh_config(5) - OpenBSD manual pages"
[9]: https://xtermjs.org/docs/?utm_source=chatgpt.com "Documentation"
[10]: https://docs.rs/crate/portable-pty/latest/source/Cargo.toml?utm_source=chatgpt.com "portable-pty 0.9.0 - Docs.rs"
[11]: https://v2.tauri.app/distribute/macos-application-bundle/?utm_source=chatgpt.com "macOS Application Bundle | Tauri"
[12]: https://www.openssh.com/releasenotes.html?utm_source=chatgpt.com "OpenSSH: Release Notes"
[13]: https://www.freerdp.com/?trk=public_profile_project-title&utm_source=chatgpt.com "FreeRDP"
[14]: https://v2.tauri.app/distribute/?utm_source=chatgpt.com "Distribute | Tauri"
