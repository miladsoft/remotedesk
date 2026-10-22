import { toast } from "sonner";
import type { Server } from "@remotedesk/types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useFtpStore } from "@/stores/useFtpStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { api, errorMessage } from "@/lib/tauri";

const PROTOCOL_LABELS: Record<Server["protocol"], string> = {
  ssh: "SSH",
  sftp: "SFTP",
  ftp: "FTP",
  rdp: "RDP",
  vnc: "VNC",
  local_shell: "local shell",
  custom_command: "custom command",
};

/** SSH, SFTP, FTP and RDP are wired to a real connection in this build;
 *  everything else gets a clear "not yet" message instead of silently doing
 *  nothing. */
export async function connectToServer(server: Server): Promise<void> {
  if (server.protocol === "ssh") {
    try {
      await useTerminalStore.getState().connect(server);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    return;
  }

  if (server.protocol === "ftp" || server.protocol === "sftp") {
    await openFileManager(server);
    return;
  }

  if (server.protocol === "rdp") {
    await openRemoteDesktop(server);
    return;
  }

  toast.error(
    `Connecting via ${PROTOCOL_LABELS[server.protocol]} isn't available yet — only SSH, SFTP, FTP and RDP are supported in this build.`,
  );
}

const isMac = navigator.userAgent.includes("Mac");

/** Hands an RDP server to the platform's native Remote Desktop client. Where
 *  that client can't be given the password directly (macOS), the Rust side
 *  copies it to the clipboard instead, and we tell the user to paste it. */
export async function openRemoteDesktop(server: Server): Promise<void> {
  try {
    const launch = await api.rdp.connect(server.id);
    toast.success(`Opening "${server.name}" in ${launch.client}`, {
      description: launch.passwordCopied
        ? `Password copied — paste it with ${isMac ? "⌘V" : "Ctrl+V"} when asked. The clipboard clears in 30 seconds.`
        : undefined,
      duration: launch.passwordCopied ? 8000 : 4000,
    });
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export function credentialLabel(server: Server): string {
  return server.authenticationType === "private_key" ? "Key passphrase" : "Password";
}

/** Copies the server's stored password to the clipboard. The secret goes
 *  from the keychain to the clipboard on the Rust side and is wiped from the
 *  clipboard again after 30 seconds. */
export async function copyServerPassword(server: Server): Promise<void> {
  try {
    await api.servers.copyCredential(server.id);
    toast.success(`${credentialLabel(server)} for "${server.name}" copied`, {
      description: "Clipboard is cleared automatically in 30 seconds.",
    });
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

/** Opens (or focuses, if already open) the dual-pane file manager for
 *  `server`. For `ssh`/`sftp` servers this reuses that server's own SSH
 *  credentials (password, private key, or agent) — nothing to re-enter. */
export async function openFileManager(server: Server): Promise<void> {
  try {
    const existing = useFtpStore.getState().sessions.find((session) => session.serverId === server.id);
    if (existing) {
      useWorkspaceStore.getState().setActive({ type: "ftp", id: existing.id });
      return;
    }
    await useFtpStore.getState().connect(server);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}
