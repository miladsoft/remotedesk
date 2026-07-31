import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeEffect } from "@/components/theme-effect";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/features/connections/Sidebar";
import { CommandPalette } from "@/features/connections/CommandPalette";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { LockScreen } from "@/features/settings/LockScreen";
import { TerminalDock } from "@/features/terminal/TerminalDock";
import { useLockStore } from "@/stores/useLockStore";
import { useServerStore } from "@/stores/useServerStore";
import { useIdleLock } from "@/hooks/useIdleLock";

function App() {
  const loaded = useLockStore((s) => s.loaded);
  const locked = useLockStore((s) => s.locked);
  const refreshLock = useLockStore((s) => s.refresh);
  const loadAll = useServerStore((s) => s.loadAll);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <img src="/rd.png" alt="RemoteDesk" className="h-20 w-20 animate-pulse rounded-2xl" />
      </div>
    );
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
          <main className="min-w-0 flex-1 overflow-hidden">
            <TerminalDock />
          </main>
        </div>
      </div>
      <CommandPalette />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster />
      <ThemeEffect />
    </TooltipProvider>
  );
}

export default App;
