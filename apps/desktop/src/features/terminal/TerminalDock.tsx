import { ChevronDown, ChevronUp, TerminalSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { TerminalPane } from "./TerminalPane";

export function TerminalDock() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const dockOpen = useTerminalStore((s) => s.dockOpen);
  const setActive = useTerminalStore((s) => s.setActive);
  const setDockOpen = useTerminalStore((s) => s.setDockOpen);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const removeSession = useTerminalStore((s) => s.removeSession);

  if (sessions.length === 0) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t bg-black",
        dockOpen ? "h-80" : "h-9",
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/10 bg-neutral-900 px-2">
        <button
          className="flex items-center gap-1.5 px-1 text-xs text-neutral-300 hover:text-white"
          onClick={() => setDockOpen(!dockOpen)}
        >
          {dockOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <TerminalSquare className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                setActive(session.id);
                setDockOpen(true);
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-t px-2.5 py-1 text-xs",
                session.id === activeSessionId
                  ? "bg-black text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200",
                session.status === "closed" && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  session.status === "open" ? "bg-emerald-500" : "bg-neutral-500",
                )}
              />
              {session.serverName}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (session.status === "open") {
                    void closeSession(session.id);
                  } else {
                    removeSession(session.id);
                  }
                }}
                className="rounded p-0.5 hover:bg-white/10"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {dockOpen && (
        <div className="min-h-0 flex-1">
          {sessions.map((session) => (
            <TerminalPane
              key={session.id}
              sessionId={session.id}
              visible={session.id === activeSessionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
