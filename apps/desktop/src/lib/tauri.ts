import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  ExportOptions,
  FtpEntry,
  FtpTransferEvent,
  ImportSummary,
  LocalListing,
  LockStatus,
  PtyEvent,
  Server,
  ServerGroup,
  ServerInput,
  Tag,
} from "@remotedesk/types";

// Thin typed wrappers around every Tauri command exposed by the Rust core.
// The frontend never sees secrets except via `revealCredential`, which
// itself requires the app-lock passphrase to be re-entered.

export const api = {
  servers: {
    list: () => invoke<Server[]>("list_servers"),
    search: (query: string) => invoke<Server[]>("search_servers", { query }),
    get: (id: string) => invoke<Server>("get_server", { id }),
    create: (input: ServerInput) => invoke<Server>("create_server", { input }),
    update: (id: string, input: ServerInput) =>
      invoke<Server>("update_server", { id, input }),
    delete: (id: string) => invoke<void>("delete_server", { id }),
    revealCredential: (id: string, passphrase: string) =>
      invoke<string>("reveal_credential", { id, passphrase }),
  },
  groups: {
    list: () => invoke<ServerGroup[]>("list_groups"),
    create: (input: Omit<ServerGroup, "id">) =>
      invoke<ServerGroup>("create_group", { input }),
    update: (id: string, input: Omit<ServerGroup, "id">) =>
      invoke<ServerGroup>("update_group", { id, input }),
    delete: (id: string) => invoke<void>("delete_group", { id }),
  },
  tags: {
    list: () => invoke<Tag[]>("list_tags"),
    create: (name: string) => invoke<Tag>("create_tag", { name }),
    rename: (id: string, name: string) => invoke<Tag>("rename_tag", { id, name }),
    delete: (id: string) => invoke<void>("delete_tag", { id }),
  },
  lock: {
    status: () => invoke<LockStatus>("is_locked"),
    unlock: (passphrase: string) => invoke<void>("unlock_app", { passphrase }),
    lock: () => invoke<void>("lock_app"),
    setPassphrase: (passphrase: string) =>
      invoke<void>("set_lock_passphrase", { passphrase }),
    clearPassphrase: () => invoke<void>("clear_lock_passphrase"),
    setIdleTimeoutMinutes: (minutes: number) =>
      invoke<void>("set_idle_timeout_minutes", { minutes }),
  },
  backup: {
    export: (path: string, options: ExportOptions) =>
      invoke<void>("export_data", {
        path,
        includeCredentials: options.includeCredentials,
        passphrase: options.passphrase,
      }),
    import: (path: string, passphrase: string) =>
      invoke<ImportSummary>("import_data", { path, passphrase }),
  },
  session: {
    /** Starts a session and returns its id; `onEvent` receives streamed pty output. */
    start: (serverId: string, onEvent: (event: PtyEvent) => void) => {
      const channel = new Channel<PtyEvent>();
      channel.onmessage = onEvent;
      return invoke<string>("start_session", { serverId, onEvent: channel });
    },
    write: (sessionId: string, data: string) =>
      invoke<void>("write_to_session", { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      invoke<void>("resize_session", { sessionId, cols, rows }),
    close: (sessionId: string) => invoke<void>("close_session", { sessionId }),
  },
  ftp: {
    connect: (serverId: string) => invoke<string>("ftp_connect", { serverId }),
    disconnect: (sessionId: string) => invoke<void>("ftp_disconnect", { sessionId }),
    pwd: (sessionId: string) => invoke<string>("ftp_pwd", { sessionId }),
    list: (sessionId: string, path: string) =>
      invoke<FtpEntry[]>("ftp_list", { sessionId, path }),
    mkdir: (sessionId: string, path: string) => invoke<void>("ftp_mkdir", { sessionId, path }),
    rmdir: (sessionId: string, path: string) => invoke<void>("ftp_rmdir", { sessionId, path }),
    delete: (sessionId: string, path: string) => invoke<void>("ftp_delete", { sessionId, path }),
    rename: (sessionId: string, from: string, to: string) =>
      invoke<void>("ftp_rename", { sessionId, from, to }),
    download: (
      sessionId: string,
      remotePath: string,
      localPath: string,
      onEvent: (event: FtpTransferEvent) => void,
    ) => {
      const channel = new Channel<FtpTransferEvent>();
      channel.onmessage = onEvent;
      return invoke<string>("ftp_download", { sessionId, remotePath, localPath, onEvent: channel });
    },
    upload: (
      sessionId: string,
      localPath: string,
      remotePath: string,
      onEvent: (event: FtpTransferEvent) => void,
    ) => {
      const channel = new Channel<FtpTransferEvent>();
      channel.onmessage = onEvent;
      return invoke<string>("ftp_upload", { sessionId, localPath, remotePath, onEvent: channel });
    },
  },
  local: {
    listDir: (path?: string) => invoke<LocalListing>("local_list_dir", { path: path ?? null }),
    mkdir: (path: string) => invoke<void>("local_mkdir", { path }),
    delete: (path: string, isDir: boolean) => invoke<void>("local_delete", { path, isDir }),
    rename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
  },
};

/** Tauri rejects commands with a plain string (see AppError's Serialize impl). */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
