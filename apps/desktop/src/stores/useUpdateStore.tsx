import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

interface UpdateStore {
  checking: boolean;
  available: Update | null;
  /** Looks for a new release. `silent` suppresses the "you're up to date" /
   * error toasts for the background startup check; an explicit "Check for
   * updates" click always reports back either way. */
  checkForUpdate: (opts?: { silent?: boolean }) => Promise<void>;
  installUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  checking: false,
  available: null,

  checkForUpdate: async ({ silent = true } = {}) => {
    set({ checking: true });
    try {
      const update = await check();
      set({ available: update, checking: false });
      if (update) {
        toast(`Update available: v${update.version}`, {
          id: "update-available",
          duration: Infinity,
          description: update.body || undefined,
          action: {
            label: "Install",
            onClick: () => void get().installUpdate(),
          },
        });
      } else if (!silent) {
        toast.success("You're on the latest version.");
      }
    } catch (err) {
      set({ checking: false });
      if (!silent) {
        toast.error(err instanceof Error ? err.message : "Couldn't check for updates");
      }
    }
  },

  installUpdate: async () => {
    const update = get().available;
    if (!update) return;

    let downloaded = 0;
    let total = 0;
    toast.loading("Downloading update…", { id: "update-progress" });

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : undefined;
          toast.loading(pct !== undefined ? `Downloading update… ${pct}%` : "Downloading update…", {
            id: "update-progress",
          });
        } else if (event.event === "Finished") {
          toast.success("Update installed — restart to apply it.", {
            id: "update-progress",
            duration: Infinity,
            action: {
              label: "Restart now",
              onClick: () => void relaunch(),
            },
          });
        }
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed", { id: "update-progress" });
    }
  },
}));
