import { toast } from "sonner";
import type { Server } from "@remotedesk/types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useFtpStore } from "@/stores/useFtpStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { errorMessage } from "@/lib/tauri";

const PROTOCOL_LABELS: Record<Server["protocol"], string> = {
  ssh: "SSH",
  sftp: "SFTP",
  ftp: "FTP",
  rdp: "RDP",
  vnc: "VNC",
  local_shell: "local shell",
  custom_command: "custom command",
};

/** Only SSH, SFTP and FTP are wired to a real connection in this build;
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

  toast.error(
    `Connecting via ${PROTOCOL_LABELS[server.protocol]} isn't available yet — only SSH, SFTP and FTP are supported in this build.`,
  );
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
