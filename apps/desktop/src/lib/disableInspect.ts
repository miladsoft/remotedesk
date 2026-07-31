/** Right-click is still needed for copy/paste in text fields and the terminal
 * (which wires its own copy/paste context menu — see TerminalPane). Every
 * other right-click, and the browser's own text-field context menu items we
 * don't support (no spellcheck/search-the-web), stay blocked. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

/**
 * Locks down the webview like a native desktop app: no stray right-click
 * context menu, no DevTools/inspect keyboard shortcuts, no page-source
 * shortcut. The real security boundary is that release builds are compiled
 * without Tauri's `devtools` Cargo feature (see src-tauri/Cargo.toml), so the
 * inspector is unreachable there regardless of this file — this just keeps
 * the everyday UX consistent with a shipped desktop app in dev mode too.
 */
export function installDesktopGuards() {
  document.addEventListener("contextmenu", (e) => {
    if (isEditableTarget(e.target) || (e.target instanceof HTMLElement && e.target.closest(".xterm"))) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const primary = e.metaKey || e.ctrlKey;

    const isDevToolsShortcut =
      key === "f12" ||
      (primary && e.altKey && key === "i") ||
      (primary && e.shiftKey && ["i", "j", "c"].includes(key)) ||
      (primary && key === "u");

    if (isDevToolsShortcut) {
      e.preventDefault();
    }
  });
}
