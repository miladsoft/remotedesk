import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import { UpdateReleaseNotes } from "@/components/UpdateReleaseNotes";

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "ready";

/** Re-check periodically so long-running sessions still hear about releases. */
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** When the window regains focus, re-check if the last check is this old. */
const FOCUS_RECHECK_AFTER_MS = 60 * 60 * 1000;
const NOTIFIED_VERSION_KEY = "updateNotifiedVersion";

interface UpdateStore {
  phase: UpdatePhase;
  checking: boolean;
  available: Update | null;
  /** Download progress 0–100, or null when the size is unknown. */
  progress: number | null;
  lastCheckedAt: number | null;
  /** Looks for a new release. `silent` suppresses the "you're up to date" /
   * error toasts for background checks; an explicit "Check for updates"
   * click always reports back either way. */
  checkForUpdate: (opts?: { silent?: boolean }) => Promise<void>;
  installUpdate: () => Promise<void>;
  /** Checks now, then every few hours and on window focus. Returns a stop function. */
  startAutoCheck: () => () => void;
}

/** One OS notification per new version — enough to be noticed even while the
 *  app is in the background, without nagging on every check. */
async function notifyOnce(version: string) {
  try {
    if (localStorage.getItem(NOTIFIED_VERSION_KEY) === version) return;
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;
    sendNotification({
      title: "RemoteDesk update available",
      body: `Version ${version} is ready to install.`,
    });
    localStorage.setItem(NOTIFIED_VERSION_KEY, version);
  } catch {
    // The in-app toast and Topbar button still announce the update.
  }
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  phase: "idle",
  checking: false,
  available: null,
  progress: null,
  lastCheckedAt: null,

  checkForUpdate: async ({ silent = true } = {}) => {
    const { phase } = get();
    // Never interrupt a download, or replace an update that's already installed.
    if (phase === "checking" || phase === "downloading" || phase === "ready") return;

    set({ phase: "checking", checking: true });
    try {
      const update = await check();
      set({
        available: update,
        phase: update ? "available" : "idle",
        checking: false,
        lastCheckedAt: Date.now(),
      });
      if (update) {
        toast(`Update available: v${update.version}`, {
          id: "update-available",
          duration: Infinity,
          description: update.body ? <UpdateReleaseNotes body={update.body} /> : undefined,
          action: {
            label: "Install",
            onClick: () => void get().installUpdate(),
          },
        });
        void notifyOnce(update.version);
      } else if (!silent) {
        toast.success("You're on the latest version.");
      }
    } catch (err) {
      set({ phase: get().available ? "available" : "idle", checking: false, lastCheckedAt: Date.now() });
      console.warn("Update check failed:", err);
      if (!silent) {
        toast.error(err instanceof Error ? err.message : String(err ?? "Couldn't check for updates"));
      }
    }
  },

  installUpdate: async () => {
    const update = get().available;
    if (!update || get().phase === "downloading") return;

    let downloaded = 0;
    let total = 0;
    set({ phase: "downloading", progress: null });
    toast.dismiss("update-available");
    toast.loading(`Downloading v${update.version}…`, { id: "update-progress" });

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
          set({ progress: pct });
          toast.loading(
            pct !== null ? `Downloading v${update.version}… ${pct}%` : `Downloading v${update.version}…`,
            { id: "update-progress" },
          );
        } else if (event.event === "Finished") {
          set({ progress: 100 });
          toast.loading("Installing update…", { id: "update-progress" });
        }
      });
      set({ phase: "ready" });
      toast.success(`v${update.version} installed — restart to apply it.`, {
        id: "update-progress",
        duration: Infinity,
        action: {
          label: "Restart now",
          onClick: () => void relaunch(),
        },
      });
    } catch (err) {
      set({ phase: "available", progress: null });
      toast.error(err instanceof Error ? err.message : String(err ?? "Update failed"), {
        id: "update-progress",
        action: { label: "Retry", onClick: () => void get().installUpdate() },
      });
    }
  },

  startAutoCheck: () => {
    void get().checkForUpdate();
    const interval = window.setInterval(() => void get().checkForUpdate(), AUTO_CHECK_INTERVAL_MS);
    const onFocus = () => {
      const last = get().lastCheckedAt;
      if (last === null || Date.now() - last > FOCUS_RECHECK_AFTER_MS) void get().checkForUpdate();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  },
}));
