import { useEffect } from "react";
import { useUiStore } from "@/stores/useUiStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const isMac = navigator.userAgent.includes("Mac");

/** Window-level shortcuts: tab switching, snippets and the shortcuts guide.
 *  Uses `e.code` so they work on any keyboard layout (e.g. Persian). The
 *  terminal deliberately lets these keys bubble up (see `isAppShortcut`). */
export function useAppShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const primary = isMac ? e.metaKey : e.ctrlKey;
      const ui = useUiStore.getState();
      const workspace = useWorkspaceStore.getState();

      if (e.ctrlKey && e.code === "Tab" && workspace.tabs.length > 1) {
        e.preventDefault();
        const index = workspace.tabs.findIndex(
          (t) => t.type === workspace.activeTab?.type && t.id === workspace.activeTab?.id,
        );
        const step = e.shiftKey ? -1 : 1;
        const next = (index + step + workspace.tabs.length) % workspace.tabs.length;
        workspace.setActive(workspace.tabs[next]);
        return;
      }

      if (!primary || e.altKey) return;

      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && !e.shiftKey) {
        // ⌘9 / Ctrl+9 always jumps to the last tab, as in browsers.
        const n = Number(digit[1]);
        const tab = n === 9 ? workspace.tabs[workspace.tabs.length - 1] : workspace.tabs[n - 1];
        if (tab) {
          e.preventDefault();
          workspace.setActive(tab);
        }
        return;
      }

      if (e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        ui.setSnippetsOpen(!ui.snippetsOpen);
        return;
      }

      if (e.code === "Slash" && (isMac || e.shiftKey)) {
        e.preventDefault();
        ui.setShortcutsOpen(!ui.shortcutsOpen);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
