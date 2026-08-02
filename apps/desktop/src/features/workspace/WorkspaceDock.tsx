import { FolderOpen, LayoutGrid, TerminalSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore, type WorkspaceTab } from "@/stores/useWorkspaceStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useFtpStore } from "@/stores/useFtpStore";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { FtpFileManager } from "@/features/ftp/FtpFileManager";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <LayoutGrid className="h-8 w-8" />
      <p className="text-sm">No active session</p>
      <p className="text-xs">Pick a server from the sidebar and hit Connect.</p>
    </div>
  );
}

function isSameTab(a: WorkspaceTab | null, b: WorkspaceTab): boolean {
  return a !== null && a.type === b.type && a.id === b.id;
}

export function WorkspaceDock() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActive = useWorkspaceStore((s) => s.setActive);

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const closeTerminal = useTerminalStore((s) => s.closeSession);
  const removeTerminal = useTerminalStore((s) => s.removeSession);

  const ftpSessions = useFtpStore((s) => s.sessions);
  const disconnectFtp = useFtpStore((s) => s.disconnect);

  if (tabs.length === 0) return <EmptyState />;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-black">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/10 bg-neutral-900 px-2">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = isSameTab(activeTab, tab);

            if (tab.type === "terminal") {
              const session = terminalSessions.find((s) => s.id === tab.id);
              if (!session) return null;
              return (
                <button
                  key={`terminal:${tab.id}`}
                  onClick={() => setActive(tab)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-t px-2.5 py-1 text-xs",
                    isActive ? "bg-black text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200",
                    session.status === "closed" && "opacity-50",
                  )}
                >
                  <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      session.status === "open" ? "bg-emerald-500" : "bg-neutral-500",
                    )}
                  />
                  <span className="max-w-40 truncate">{session.serverName}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (session.status === "open") {
                        void closeTerminal(session.id);
                      } else {
                        removeTerminal(session.id);
                      }
                    }}
                    className="rounded p-0.5 hover:bg-white/10"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              );
            }

            const session = ftpSessions.find((s) => s.id === tab.id);
            if (!session) return null;
            return (
              <button
                key={`ftp:${tab.id}`}
                onClick={() => setActive(tab)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-t px-2.5 py-1 text-xs",
                  isActive ? "bg-black text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200",
                )}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="max-w-40 truncate">{session.serverName}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    void disconnectFtp(session.id);
                  }}
                  className="rounded p-0.5 hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {terminalSessions.map((session) => (
          <TerminalPane
            key={session.id}
            sessionId={session.id}
            visible={isSameTab(activeTab, { type: "terminal", id: session.id })}
          />
        ))}
        {ftpSessions.map((session) => (
          <FtpFileManager
            key={session.id}
            session={session}
            visible={isSameTab(activeTab, { type: "ftp", id: session.id })}
          />
        ))}
      </div>
    </div>
  );
}
