import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eraser,
  KeyRound,
  Search,
  TextSelect,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/tauri";
import { copyServerPassword, credentialLabel } from "@/lib/connect";
import { cn } from "@/lib/utils";
import { useServerStore } from "@/stores/useServerStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  useTerminalSettingsStore,
} from "@/stores/useTerminalSettingsStore";

const isMac = navigator.userAgent.includes("Mac");
const isWindows = navigator.userAgent.includes("Windows");
const isLinux = !isMac && !isWindows;

const SHORTCUTS = {
  copy: isMac ? "⌘C" : "Ctrl+Shift+C",
  paste: isMac ? "⌘V" : "Ctrl+Shift+V",
  selectAll: isMac ? "⌘A" : "Ctrl+Shift+A",
  find: isMac ? "⌘F" : "Ctrl+Shift+F",
  zoomIn: isMac ? "⌘+" : "Ctrl++",
  zoomOut: isMac ? "⌘−" : "Ctrl+−",
};

type TerminalAction =
  | "copy"
  | "paste"
  | "selectAll"
  | "find"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset";

/** Layout-independent key name: `e.code` for letters/digits so shortcuts keep
 *  working on non-Latin keyboard layouts (where `e.key` is e.g. "ز" for C). */
function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith("Key")) return e.code.slice(3).toLowerCase();
  switch (e.code) {
    case "Equal":
    case "NumpadAdd":
      return "+";
    case "Minus":
    case "NumpadSubtract":
      return "-";
    case "Digit0":
    case "Numpad0":
      return "0";
    case "Insert":
      return "insert";
    default:
      return e.key.toLowerCase();
  }
}

/** Maps a keydown to a terminal action, following each platform's terminal
 *  conventions: ⌘ shortcuts on macOS (Terminal.app/iTerm), Ctrl+Shift on
 *  Windows/Linux (Windows Terminal/GNOME Terminal) plus Ctrl/Shift+Insert.
 *  Anything else falls through to the shell untouched. */
function shortcutFor(e: KeyboardEvent, hasSelection: boolean): TerminalAction | null {
  const key = keyName(e);

  if (isMac) {
    if (!e.metaKey || e.ctrlKey || e.altKey) return null;
    switch (key) {
      case "c":
        return "copy";
      case "v":
        return "paste";
      case "a":
        return "selectAll";
      case "f":
        return "find";
      case "+":
        return "zoomIn";
      case "-":
        return "zoomOut";
      case "0":
        return "zoomReset";
      default:
        return null;
    }
  }

  if (key === "insert" && e.shiftKey && !e.ctrlKey) return "paste";
  if (key === "insert" && e.ctrlKey && !e.shiftKey) return "copy";
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;

  if (e.shiftKey) {
    switch (key) {
      case "c":
        return "copy";
      case "v":
        return "paste";
      case "a":
        return "selectAll";
      case "f":
        return "find";
      case "+":
        return "zoomIn";
      default:
        return null;
    }
  }

  switch (key) {
    // Windows Terminal convention: Ctrl+C copies while there's a selection
    // and is a normal interrupt (SIGINT) otherwise.
    case "c":
      return hasSelection ? "copy" : null;
    case "v":
      return isWindows ? "paste" : null;
    case "+":
      return "zoomIn";
    case "-":
      return "zoomOut";
    case "0":
      return "zoomReset";
    default:
      return null;
  }
}

/** A single line ending in a newline would run the instant it's pasted (the
 *  usual result of copying a command from a web page); drop that newline so
 *  the user still gets to review it and press Enter. */
function trimSingleTrailingNewline(text: string): string {
  const match = /^([^\r\n]*)(\r\n|\r|\n)$/.exec(text);
  return match ? match[1] : text;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

interface TerminalPaneProps {
  sessionId: string;
  /** Kept mounted but hidden for inactive tabs so xterm state/scrollback survives tab switches. */
  visible: boolean;
}

export function TerminalPane({ sessionId, visible }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);

  const subscribe = useTerminalStore((s) => s.subscribe);
  const session = useTerminalStore((s) => s.sessions.find((x) => x.id === sessionId));
  const server = useServerStore((s) =>
    session ? s.servers.find((x) => x.id === session.serverId) : undefined,
  );
  const settings = useTerminalSettingsStore();

  const [hasSelection, setHasSelection] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMiss, setSearchMiss] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const canUsePassword = Boolean(server?.credentialReference) && session?.status === "open";

  function showFlash(message: string, durationMs = 1200) {
    setFlash(message);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), durationMs);
  }

  function fitAndResize() {
    const term = termRef.current;
    if (!term || !fitRef.current) return;
    fitRef.current.fit();
    void api.session.resize(sessionId, term.cols, term.rows).catch(() => {});
  }

  function copySelection({ clearAfter = false } = {}) {
    const term = termRef.current;
    if (!term?.hasSelection()) return;
    const text = term.getSelection();
    if (clearAfter) term.clearSelection();
    writeText(text)
      .then(() => showFlash("Copied"))
      .catch((err) => toast.error(`Copy failed: ${errorMessage(err)}`));
  }

  function pasteText(raw: string) {
    const term = termRef.current;
    if (!term || !raw) return;
    const text = trimSingleTrailingNewline(raw);
    // Shells with bracketed paste on (zsh, fish, bash ≥ 5.1) hold pasted
    // lines until Enter anyway, so only warn when they'd run immediately.
    const runsImmediately = /[\r\n]/.test(text) && !term.modes.bracketedPasteMode;
    if (runsImmediately && useTerminalSettingsStore.getState().confirmMultilinePaste) {
      setDontAskAgain(false);
      setPendingPaste(text);
      return;
    }
    // `term.paste` (not a raw pty write) applies bracketed-paste wrapping and
    // newline normalisation exactly like a native terminal does.
    term.paste(text);
    term.focus();
  }

  async function pasteFromClipboard() {
    try {
      pasteText(await readText());
    } catch {
      showFlash("Clipboard has no text to paste");
    }
  }

  function confirmPendingPaste() {
    const term = termRef.current;
    if (term && pendingPaste !== null) {
      if (dontAskAgain) settings.setConfirmMultilinePaste(false);
      term.paste(pendingPaste);
      term.focus();
    }
    setPendingPaste(null);
  }

  function selectAll() {
    termRef.current?.selectAll();
  }

  function clearTerminal() {
    termRef.current?.clear();
    termRef.current?.focus();
  }

  function openSearch() {
    setSearchOpen(true);
    const selection = termRef.current?.getSelection();
    if (selection && !selection.includes("\n")) setSearchQuery(selection);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchMiss(false);
    termRef.current?.clearSelection();
    termRef.current?.focus();
  }

  function findNext(query = searchQuery, incremental = false) {
    if (!query) {
      setSearchMiss(false);
      return;
    }
    setSearchMiss(!searchAddonRef.current?.findNext(query, { incremental }));
  }

  function findPrevious() {
    if (!searchQuery) return;
    setSearchMiss(!searchAddonRef.current?.findPrevious(searchQuery));
  }

  async function typePassword() {
    if (!server || !session) return;
    try {
      await api.session.sendCredential(server.id, session.id);
      showFlash(`${credentialLabel(server)} typed — press Enter to submit`, 2500);
      termRef.current?.focus();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function zoom(direction: "in" | "out" | "reset") {
    const { fontSize, setFontSize } = useTerminalSettingsStore.getState();
    const next =
      direction === "reset" ? DEFAULT_TERMINAL_FONT_SIZE : fontSize + (direction === "in" ? 1 : -1);
    setFontSize(next);
    showFlash(`Font size ${useTerminalSettingsStore.getState().fontSize}px`);
  }

  function runAction(action: TerminalAction) {
    switch (action) {
      case "copy":
        // On Windows/Linux the selection is dropped after a keyboard copy so
        // the next Ctrl+C is an interrupt again, as in Windows Terminal.
        copySelection({ clearAfter: !isMac });
        break;
      case "paste":
        void pasteFromClipboard();
        break;
      case "selectAll":
        selectAll();
        break;
      case "find":
        openSearch();
        break;
      case "zoomIn":
        zoom("in");
        break;
      case "zoomOut":
        zoom("out");
        break;
      case "zoomReset":
        zoom("reset");
        break;
    }
  }

  // xterm's event handlers are wired once per session; they reach the latest
  // render's closures (settings, server, state setters) through this ref.
  const actionsRef = useRef({ runAction, copySelection, pasteText, pasteFromClipboard, showFlash });
  actionsRef.current = { runAction, copySelection, pasteText, pasteFromClipboard, showFlash };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: useTerminalSettingsStore.getState().fontSize,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      scrollback: 10000,
      theme: {
        background: "#000000",
        selectionBackground: "#3b82f680",
        selectionInactiveBackground: "#3b82f640",
      },
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (isMac ? event.metaKey : event.ctrlKey) {
          openUrl(uri).catch((err) => toast.error(errorMessage(err)));
        } else {
          actionsRef.current.showFlash(`${isMac ? "⌘" : "Ctrl"}+click to open link`);
        }
      }),
    );
    term.open(container);
    termRef.current = term;
    fitRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const unsubscribe = subscribe(sessionId, (event) => {
      if (event.type === "data") {
        term.write(event.data);
      } else if (event.type === "exited") {
        term.write(`\r\n\x1b[90m[session ended, exit code ${event.code}]\x1b[0m\r\n`);
      }
    });

    const dataDisposable = term.onData((data) => {
      void api.session.write(sessionId, data).catch(() => {});
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const action = shortcutFor(e, term.hasSelection());
      if (!action) return true;
      e.preventDefault();
      actionsRef.current.runAction(action);
      return false;
    });

    // Copy-on-select, debounced so a drag doesn't hammer the clipboard.
    let copyOnSelectTimer: number | undefined;
    const selectionDisposable = term.onSelectionChange(() => {
      window.clearTimeout(copyOnSelectTimer);
      if (!useTerminalSettingsStore.getState().copyOnSelect || !term.hasSelection()) return;
      copyOnSelectTimer = window.setTimeout(() => {
        if (term.hasSelection()) actionsRef.current.copySelection();
      }, 250);
    });

    // ResizeObserver always fires once immediately on observe() even if the
    // size hasn't changed, so this alone covers the initial fit too — a
    // separate fitAddon.fit() call before this would double-fire the PTY
    // resize (and visibly jump the shell's redraw) right on mount.
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void api.session.resize(sessionId, term.cols, term.rows).catch(() => {});
    });
    resizeObserver.observe(container);

    // xterm's own mouse handling reacts to mousedown, including the right
    // button, and can collapse the current selection before the context
    // menu ever sees it (mousedown always fires first). Stopping the
    // right-button mousedown in the capture phase means xterm never touches
    // the selection on a right-click, so `term.hasSelection()` is always the
    // live, correct answer when the menu (or copy/paste) acts on it.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) e.stopPropagation();
    };
    container.addEventListener("mousedown", onMouseDown, { capture: true });

    // "Copy / paste" right-click mode (PuTTY style): copy the selection, or
    // paste if nothing's selected. In "menu" mode the Radix context menu
    // wrapping the container handles the event instead.
    const onContextMenu = (e: MouseEvent) => {
      if (useTerminalSettingsStore.getState().rightClickAction !== "copyPaste") return;
      e.preventDefault();
      e.stopPropagation();
      if (term.hasSelection()) {
        actionsRef.current.copySelection({ clearAfter: true });
      } else {
        void actionsRef.current.pasteFromClipboard();
      }
    };
    container.addEventListener("contextmenu", onContextMenu);

    // Pastes arriving as a DOM event (e.g. Edit ▸ Paste in the macOS menu bar)
    // go through the same path as keyboard pastes: trailing-newline trim and
    // the multi-line warning, instead of xterm's unguarded built-in handler.
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      actionsRef.current.pasteText(e.clipboardData?.getData("text/plain") ?? "");
    };
    container.addEventListener("paste", onPaste, { capture: true });

    // Middle-click pastes on Linux, as in every X11/Wayland terminal.
    const onAuxClick = (e: MouseEvent) => {
      if (isLinux && e.button === 1) {
        e.preventDefault();
        void actionsRef.current.pasteFromClipboard();
      }
    };
    container.addEventListener("auxclick", onAuxClick);

    return () => {
      window.clearTimeout(copyOnSelectTimer);
      unsubscribe();
      dataDisposable.dispose();
      selectionDisposable.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("paste", onPaste, { capture: true });
      container.removeEventListener("auxclick", onAuxClick);
      termRef.current = null;
      fitRef.current = null;
      searchAddonRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || term.options.fontSize === settings.fontSize) return;
    term.options.fontSize = settings.fontSize;
    fitAndResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontSize]);

  // Focus the terminal whenever its tab is shown, so typing (and ⌘V) works
  // straight away without an extra click.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fitAndResize();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

  const pendingLines = pendingPaste === null ? [] : splitLines(pendingPaste);

  return (
    <div
      className="relative h-full w-full bg-black p-2"
      style={{ display: visible ? "block" : "none" }}
    >
      <ContextMenu
        onOpenChange={(open) => {
          if (open) setHasSelection(termRef.current?.hasSelection() ?? false);
        }}
      >
        <ContextMenuTrigger asChild disabled={settings.rightClickAction !== "menu"}>
          <div className="h-full w-full" ref={containerRef} />
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            termRef.current?.focus();
          }}
        >
          <ContextMenuItem disabled={!hasSelection} onSelect={() => copySelection()}>
            <Copy /> Copy
            <ContextMenuShortcut>{SHORTCUTS.copy}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void pasteFromClipboard()}>
            <ClipboardPaste /> Paste
            <ContextMenuShortcut>{SHORTCUTS.paste}</ContextMenuShortcut>
          </ContextMenuItem>
          {canUsePassword && server && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => void typePassword()}>
                <KeyRound /> Type {credentialLabel(server).toLowerCase()}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void copyServerPassword(server)}>
                <ClipboardCopy /> Copy {credentialLabel(server).toLowerCase()}
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={selectAll}>
            <TextSelect /> Select all
            <ContextMenuShortcut>{SHORTCUTS.selectAll}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={openSearch}>
            <Search /> Find…
            <ContextMenuShortcut>{SHORTCUTS.find}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={clearTerminal}>
            <Eraser /> Clear terminal
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => zoom("in")}>
            <ZoomIn /> Zoom in
            <ContextMenuShortcut>{SHORTCUTS.zoomIn}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => zoom("out")}>
            <ZoomOut /> Zoom out
            <ContextMenuShortcut>{SHORTCUTS.zoomOut}</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {searchOpen && (
        <div className="absolute top-3 right-5 z-10 flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900/95 p-1 shadow-lg">
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="Find"
            spellCheck={false}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              findNext(e.target.value, true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) findPrevious();
                else findNext();
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
              }
            }}
            className={cn(
              "h-7 w-48 rounded bg-neutral-800 px-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-blue-500",
              searchMiss && "ring-1 ring-red-500/70 focus:ring-red-500/70",
            )}
          />
          <SearchButton title="Previous match (Shift+Enter)" onClick={findPrevious}>
            <ArrowUp className="h-3.5 w-3.5" />
          </SearchButton>
          <SearchButton title="Next match (Enter)" onClick={() => findNext()}>
            <ArrowDown className="h-3.5 w-3.5" />
          </SearchButton>
          <SearchButton title="Close (Esc)" onClick={closeSearch}>
            <X className="h-3.5 w-3.5" />
          </SearchButton>
        </div>
      )}

      {flash && (
        <div className="pointer-events-none absolute right-5 bottom-4 z-10 rounded-md bg-neutral-800/95 px-2.5 py-1 text-xs text-neutral-100 shadow-lg">
          {flash}
        </div>
      )}

      <AlertDialog open={pendingPaste !== null} onOpenChange={(open) => !open && setPendingPaste(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paste {pendingLines.length} lines?</AlertDialogTitle>
            <AlertDialogDescription>
              This shell runs each line as soon as it's pasted. Check the text before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
            {pendingLines.slice(0, 50).join("\n")}
            {pendingLines.length > 50 && `\n… ${pendingLines.length - 50} more lines`}
          </pre>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`paste-dont-ask-${sessionId}`}
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <Label htmlFor={`paste-dont-ask-${sessionId}`} className="text-sm font-normal">
              Don't ask again
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingPaste}>Paste</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SearchButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-neutral-300 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
