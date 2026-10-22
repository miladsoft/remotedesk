// TEMPORARY e2e harness: stands in for the Rust backend. Not committed.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Chan = { onmessage: (m: unknown) => void };
const w = window as unknown as Record<string, unknown>;
const log: { cmd: string; args: unknown }[] = [];
w.__mockLog = log;
w.__clipboard = "";
const channels = new Map<string, Chan>();
let nextSession = 1;

const base = {
  description: null, port: 22, authenticationType: "password", privateKeyPath: null,
  groupId: null, jumpServerId: null, workingDirectory: null, terminalProfileId: null,
  isFavorite: false, tagIds: [], customCommand: null, createdAt: "", updatedAt: "",
};
const servers = [
  { ...base, id: "srv-ssh", name: "Prod Web", hostname: "web.example.com", protocol: "ssh", username: "deploy", credentialReference: "keychain:srv-ssh:password", isFavorite: true },
  { ...base, id: "srv-rdp", name: "Win Desktop", hostname: "10.0.0.5", port: 3389, protocol: "rdp", username: "CORP\\alice", credentialReference: "keychain:srv-rdp:password" },
  { ...base, id: "srv-key", name: "Build Box", hostname: "build.internal", port: 2222, protocol: "ssh", username: "ci", authenticationType: "private_key", privateKeyPath: "~/.ssh/id_ed25519", credentialReference: null },
];

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") for (const x of Object.values(v)) { const s = firstString(x); if (s !== undefined) return s; }
  return undefined;
}
const send = (id: string, data: string) => channels.get(id)?.onmessage({ type: "data", data });

mockWindows("main");
mockIPC((cmd, args) => {
  const a = (args ?? {}) as Record<string, unknown>;
  log.push({ cmd, args: a });
  switch (cmd) {
    case "is_locked": return { locked: false, passphraseSet: false, idleTimeoutMinutes: 15 };
    case "list_servers": return servers;
    case "search_servers": return servers.filter((s) => s.name.toLowerCase().includes(String(a.query).toLowerCase()));
    case "list_groups": case "list_tags": return [];
    case "copy_credential": w.__clipboard = "S3cr3t-Pa55"; return null;
    case "rdp_connect": return { client: "Windows App", passwordCopied: true };
    case "start_session": {
      const id = `session-${nextSession++}`;
      channels.set(id, a.onEvent as Chan);
      setTimeout(() => send(id, "Welcome to Ubuntu 24.04 LTS\r\nVisit https://example.com/docs for help\r\ndeploy@web:~$ "), 50);
      return id;
    }
    case "write_to_session": {
      const id = String(a.sessionId); const data = String(a.data);
      if (data === "\r") {
        const line = (w.__line as string) ?? ""; w.__line = "";
        if (line.trim() === "exit") { send(id, "\r\nlogout"); channels.get(id)?.onmessage({ type: "exited", code: 0 }); return null; }
        send(id, `\r\n${line ? `ran: ${line}\r\n` : ""}deploy@web:~$ `);
      } else { w.__line = ((w.__line as string) ?? "") + data; send(id, data.replace(/\n/g, "\r\n")); }
      return null;
    }
    case "send_credential_to_session": send(String(a.sessionId), "[password typed]"); return null;
    case "resize_session": case "close_session": return null;
    case "plugin:clipboard-manager|write_text": w.__clipboard = firstString(a) ?? ""; return null;
    case "plugin:clipboard-manager|read_text": return w.__clipboard;
    case "plugin:app|version": return "0.1.8";
    case "plugin:notification|is_permission_granted": return true;
    case "plugin:updater|check":
      return { rid: 1, currentVersion: "0.1.8", version: "0.1.9", date: null, body: "### What's new\n- Splash screen\n- Snippets", rawJson: {} };
    case "plugin:updater|download_and_install": {
      const ch = a.onEvent as Chan;
      return new Promise((resolve) => {
        ch.onmessage({ event: "Started", data: { contentLength: 1000 } });
        let sent = 0;
        const t = setInterval(() => {
          sent += 250; ch.onmessage({ event: "Progress", data: { chunkLength: 250 } });
          if (sent >= 1000) { clearInterval(t); ch.onmessage({ event: "Finished" }); resolve(null); }
        }, 400);
      });
    }
    default: return null;
  }
});

await import("./src/main.tsx");
