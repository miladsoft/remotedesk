import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import "@xterm/xterm/css/xterm.css";
import { api, errorMessage } from "@/lib/tauri";
import { useTerminalStore } from "@/stores/useTerminalStore";

interface TerminalPaneProps {
  sessionId: string;
  /** Kept mounted but hidden for inactive tabs so xterm state/scrollback survives tab switches. */
  visible: boolean;
}

export function TerminalPane({ sessionId, visible }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const subscribe = useTerminalStore((s) => s.subscribe);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: { background: "#000000" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

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

    // ResizeObserver always fires once immediately on observe() even if the
    // size hasn't changed, so this alone covers the initial fit too — a
    // separate fitAddon.fit() call before this would double-fire the PTY
    // resize (and visibly jump the shell's redraw) right on mount.
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void api.session.resize(sessionId, term.cols, term.rows).catch(() => {});
    });
    resizeObserver.observe(container);

    // Right-click copies the current selection, or pastes the clipboard if
    // nothing's selected — the standard terminal-app convention. Uses
    // Tauri's clipboard plugin rather than the raw `navigator.clipboard` Web
    // API, which the webview restricts (readText in particular tends to
    // silently fail there).
    //
    // xterm's own mouse handling reacts to mousedown, including the right
    // button, and can collapse the current selection before our contextmenu
    // handler ever sees it (mousedown always fires first). Rather than
    // snapshotting the selection ourselves at mousedown — which depends on
    // the browser reliably reporting button 2 on every single right-click,
    // not guaranteed for trackpad "secondary click" gestures and prone to
    // going stale across repeated clicks — we stop the right-button
    // mousedown from ever reaching xterm's own (bubble-phase) handler in
    // the first place, via a capture-phase listener. xterm then never
    // touches the selection on a right-click, so `term.hasSelection()` at
    // contextmenu time is always the live, correct answer, every time.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.stopPropagation();
      }
    };
    container.addEventListener("mousedown", onMouseDown, { capture: true });

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (term.hasSelection()) {
        const selection = term.getSelection();
        term.clearSelection();
        writeText(selection).catch((err) => toast.error(`Copy failed: ${errorMessage(err)}`));
      } else {
        readText()
          .then((text) => {
            if (text) void api.session.write(sessionId, text).catch(() => {});
          })
          .catch((err) => toast.error(`Paste failed: ${errorMessage(err)}`));
      }
    };
    container.addEventListener("contextmenu", onContextMenu);

    return () => {
      unsubscribe();
      dataDisposable.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
      container.removeEventListener("contextmenu", onContextMenu);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      className="h-full w-full bg-black p-2"
      style={{ display: visible ? "block" : "none" }}
    >
      <div className="h-full w-full" ref={containerRef} />
    </div>
  );
}
