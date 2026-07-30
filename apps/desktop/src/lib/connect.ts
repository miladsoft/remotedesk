import { toast } from "sonner";
import type { Server } from "@remotedesk/types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { errorMessage } from "@/lib/tauri";

const PROTOCOL_LABELS: Record<Server["protocol"], string> = {
  ssh: "SSH",
  sftp: "SFTP",
  rdp: "RDP",
  vnc: "VNC",
  local_shell: "local shell",
  custom_command: "custom command",
};

/** Only SSH is wired to a real connection in this build; everything else
 *  gets a clear "not yet" message instead of silently doing nothing. */
export async function connectToServer(server: Server): Promise<void> {
  if (server.protocol !== "ssh") {
    toast.error(
      `Connecting via ${PROTOCOL_LABELS[server.protocol]} isn't available yet — only SSH is supported in this build.`,
    );
    return;
  }
  try {
    await useTerminalStore.getState().connect(server);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}
