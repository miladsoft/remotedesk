// Shared TypeScript contracts for the Tauri IPC boundary.
// Keep in sync with the Rust structs in apps/desktop/src-tauri/src/domain.

export type Protocol = "ssh" | "sftp" | "ftp" | "rdp" | "vnc" | "local_shell" | "custom_command";

export type AuthType = "password" | "private_key" | "agent";

export interface ServerGroup {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Server {
  id: string;
  name: string;
  description: string | null;
  hostname: string;
  port: number;
  protocol: Protocol;
  username: string | null;
  authenticationType: AuthType;
  /** Opaque reference into the OS keychain. Never the secret itself. */
  credentialReference: string | null;
  privateKeyPath: string | null;
  groupId: string | null;
  jumpServerId: string | null;
  workingDirectory: string | null;
  terminalProfileId: string | null;
  isFavorite: boolean;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload sent when creating/updating a server. `secret` is transient — Rust writes
 *  it to the OS keychain and never stores it, and the field is zeroized after use. */
export interface ServerInput {
  name: string;
  description: string | null;
  hostname: string;
  port: number;
  protocol: Protocol;
  username: string | null;
  authenticationType: AuthType;
  secret: string | null;
  privateKeyPath: string | null;
  groupId: string | null;
  jumpServerId: string | null;
  workingDirectory: string | null;
  terminalProfileId: string | null;
  isFavorite: boolean;
  tagIds: string[];
}

export interface ConnectionHistoryEntry {
  id: string;
  serverId: string;
  protocol: Protocol;
  startedAt: string;
  endedAt: string | null;
  status: "success" | "failed" | "cancelled";
  errorSummary: string | null;
}

export interface LockStatus {
  locked: boolean;
  passphraseSet: boolean;
  idleTimeoutMinutes: number;
}

export interface ExportOptions {
  includeCredentials: boolean;
  passphrase: string;
}

export interface ImportSummary {
  serversImported: number;
  groupsImported: number;
  tagsImported: number;
  credentialsImported: number;
}

/** Streamed from Rust over a Tauri Channel while a terminal session is open. */
export type PtyEvent = { type: "data"; data: string } | { type: "exited"; code: number };

export interface FtpEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
}

/** Streamed from Rust over a Tauri Channel while an upload/download runs. */
export type FtpTransferEvent =
  | { type: "progress"; transferred: number; total: number | null }
  | { type: "completed" }
  | { type: "failed"; message: string };

export interface LocalEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
}

export interface LocalListing {
  path: string;
  parent: string | null;
  entries: LocalEntry[];
}
