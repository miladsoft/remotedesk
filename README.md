# RemoteDesk

A cross-platform, local-first remote server connection manager for macOS, Windows, and Linux — built with [Tauri 2](https://tauri.app), Rust, and React.

[![Latest release](https://img.shields.io/github/v/release/miladsoft/server-manager?label=latest%20release)](https://github.com/miladsoft/server-manager/releases/latest)
[![Release build](https://github.com/miladsoft/server-manager/actions/workflows/release.yml/badge.svg)](https://github.com/miladsoft/server-manager/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **SSH connection manager** — organize servers into groups and tags, mark favorites, and jump straight in from a `⌘K` command palette.
- **Integrated terminal** — a resizable, multi-tab terminal panel with real PTY sessions, right next to your server list.
- **Jump hosts** — chain connections through intermediate SSH hops.
- **Secure by default** — passwords and private-key passphrases live in your OS keychain (Keychain / Credential Manager / Secret Service), never in the local database. An optional app-lock passphrase gates the whole app and any credential reveal.
- **Encrypted backups** — export and import your servers, groups, and (optionally) credentials as a passphrase-encrypted backup file.

## Download

Grab the latest build for your platform from the [**Releases**](https://github.com/miladsoft/server-manager/releases/latest) page:

| Platform | Format |
| --- | --- |
| macOS (Apple Silicon & Intel, universal) | `.dmg` |
| Windows | `.msi` installer |
| Linux | `.deb`, `.rpm`, or `.AppImage` |

> **Note:** builds aren't code-signed yet (no Apple Developer / Windows code-signing certificate). macOS will show an "unidentified developer" warning (right-click the app → *Open* to bypass) and Windows SmartScreen may warn on first launch — this is expected for an unsigned open-source build.

## Development

Prerequisites: [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 9+, and a [Rust toolchain](https://rustup.rs) with the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install     # install dependencies for the whole workspace
pnpm dev         # launch the desktop app (Tauri + Vite) in dev mode
pnpm build       # produce a production build for your current OS
pnpm typecheck   # type-check the desktop app
```

The desktop app lives in [`apps/desktop`](apps/desktop) (React/Vite frontend in `src`, Rust/Tauri backend in `src-tauri`); shared TypeScript types live in [`packages/types`](packages/types).

## Releasing

Releases are built and published automatically by [`.github/workflows/release.yml`](.github/workflows/release.yml) for macOS, Windows, and Linux. To cut a release:

1. **Tag it:**
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
   or **run it manually** from the *Actions* tab → *Release* → *Run workflow*, entering a version number — the tag is created for you.
2. The workflow stamps that version into `package.json`, `tauri.conf.json`, and `Cargo.toml`, builds installers for all three platforms, and publishes them to a new [GitHub Release](https://github.com/miladsoft/server-manager/releases) with that tag.

## License

[MIT](LICENSE)
