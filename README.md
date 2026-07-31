# RemoteDesk

A cross-platform, local-first remote server connection manager for macOS, Windows, and Linux — built with Rust and React.

[![Latest release](https://img.shields.io/github/v/release/miladsoft/remotedesk?label=latest%20release)](https://github.com/miladsoft/remotedesk/releases/latest)
[![Release build](https://github.com/miladsoft/remotedesk/actions/workflows/release.yml/badge.svg)](https://github.com/miladsoft/remotedesk/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **SSH connection manager** — organize servers into groups and tags, mark favorites, and jump straight in from a `⌘K` command palette.
- **Integrated terminal** — a resizable, multi-tab terminal panel with real PTY sessions, right next to your server list.
- **Jump hosts** — chain connections through intermediate SSH hops.
- **Secure by default** — passwords and private-key passphrases live in your OS keychain (Keychain / Credential Manager / Secret Service), never in the local database. An optional app-lock passphrase gates the whole app and any credential reveal.
- **Encrypted backups** — export and import your servers, groups, and (optionally) credentials as a passphrase-encrypted backup file.

## Download

Grab the latest build for your platform from the [**Releases**](https://github.com/miladsoft/remotedesk/releases/latest) page:

| Platform | Format |
| --- | --- |
| macOS (Apple Silicon & Intel, universal) | `.dmg` |
| Windows | `.msi` installer |
| Linux | `.deb`, `.rpm`, or `.AppImage` |

> **Note:** builds aren't code-signed yet (no Apple Developer / Windows code-signing certificate). macOS will show an "unidentified developer" warning (right-click the app → *Open* to bypass) and Windows SmartScreen may warn on first launch — this is expected for an unsigned open-source build.

## Development

Prerequisites: [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 9+, and a [Rust toolchain](https://rustup.rs). On Linux you'll also need the WebKitGTK development libraries (see [`.github/workflows/release.yml`](.github/workflows/release.yml) for the exact package list); macOS needs the Xcode Command Line Tools and Windows needs the Visual Studio Build Tools.

```bash
pnpm install     # install dependencies for the whole workspace
pnpm dev         # launch the desktop app in dev mode
pnpm build       # produce a production build for your current OS
pnpm typecheck   # type-check the desktop app
```

The desktop app lives in [`apps/desktop`](apps/desktop) (React/Vite frontend in `src`, Rust backend in `src-tauri`); shared TypeScript types live in [`packages/types`](packages/types).

## Releasing

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on every commit to `main`:

- It always runs a fast build check (typecheck + `cargo check`).
- If the `version` in [`package.json`](package.json) is one that hasn't been released yet, it also builds installers for macOS, Windows, and Linux and publishes them to a new [GitHub Release](https://github.com/miladsoft/remotedesk/releases) tagged `v<version>`.

So cutting a release is just:

```bash
# bump "version" in package.json, e.g. 0.1.0 -> 0.2.0
git commit -am "release: 0.2.0"
git push
```

Commits that don't change the version just get the build check — nothing is published.

## License

[MIT](LICENSE)
