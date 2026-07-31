import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "@/lib/tauri";
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
    fitAddon.fit();
    void api.session.resize(sessionId, term.cols, term.rows).catch(() => {});

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

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void api.session.resize(sessionId, term.cols, term.rows).catch(() => {});
    });
    resizeObserver.observe(container);

    // Right-click copies the current selection, or pastes the clipboard if
    // nothing's selected — the standard terminal-app convention.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
      } else {
        void navigator.clipboard.readText().then((text) => {
          if (text) void api.session.write(sessionId, text);
        });
      }
    };
    container.addEventListener("contextmenu", onContextMenu);

    return () => {
      unsubscribe();
      dataDisposable.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      className="h-full w-full bg-black"
      style={{ display: visible ? "block" : "none" }}
      ref={containerRef}
    />
  );
}
