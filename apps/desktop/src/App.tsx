import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeEffect } from "@/components/theme-effect";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/features/connections/Sidebar";
import { ServerList } from "@/features/connections/ServerList";
import { CommandPalette } from "@/features/connections/CommandPalette";
import { ServerFormDialog } from "@/features/connections/ServerFormDialog";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { LockScreen } from "@/features/settings/LockScreen";
import { useLockStore } from "@/stores/useLockStore";
import { useServerStore } from "@/stores/useServerStore";
import { useIdleLock } from "@/hooks/useIdleLock";
import type { Server } from "@remotedesk/types";

function App() {
  const loaded = useLockStore((s) => s.loaded);
  const locked = useLockStore((s) => s.locked);
  const refreshLock = useLockStore((s) => s.refresh);
  const loadAll = useServerStore((s) => s.loadAll);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickEditServer, setQuickEditServer] = useState<Server | null>(null);

  useIdleLock();

  useEffect(() => {
    void refreshLock();
  }, [refreshLock]);

  useEffect(() => {
    if (loaded && !locked) {
      void loadAll();
    }
  }, [loaded, locked, loadAll]);

  if (!loaded) {
    return <div className="flex h-screen items-center justify-center bg-background" />;
  }

  if (locked) {
    return (
      <TooltipProvider>
        <LockScreen />
        <Toaster />
        <ThemeEffect />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Topbar onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <ServerList />
          </main>
        </div>
      </div>
      <CommandPalette onSelectServer={setQuickEditServer} />
      <ServerFormDialog
        open={quickEditServer !== null}
        onOpenChange={(open) => !open && setQuickEditServer(null)}
        server={quickEditServer ?? undefined}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster />
      <ThemeEffect />
    </TooltipProvider>
  );
}

export default App;
