import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeEffect } from "@/components/theme-effect";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/features/connections/Sidebar";
import { CommandPalette } from "@/features/connections/CommandPalette";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { LockScreen } from "@/features/settings/LockScreen";
import { WorkspaceDock } from "@/features/workspace/WorkspaceDock";
import { useLockStore } from "@/stores/useLockStore";
import { useServerStore } from "@/stores/useServerStore";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { useIdleLock } from "@/hooks/useIdleLock";
import { useAppShortcuts } from "@/hooks/useAppShortcuts";
import { SnippetsDialog } from "@/features/snippets/SnippetsDialog";
import { ShortcutsDialog } from "@/features/help/ShortcutsDialog";
import { hideSplash } from "@/lib/splash";

function App() {
  const loaded = useLockStore((s) => s.loaded);
  const locked = useLockStore((s) => s.locked);
  const refreshLock = useLockStore((s) => s.refresh);
  const loadAll = useServerStore((s) => s.loadAll);
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useIdleLock();
  useAppShortcuts();

  useEffect(() => {
    void refreshLock();
  }, [refreshLock]);

  useEffect(() => {
    if (!loaded) return;
    if (locked) {
      hideSplash();
      return;
    }
    // Keep the splash up until the server list is in, so the app appears
    // fully populated instead of popping in an empty sidebar first.
    void loadAll().finally(hideSplash);
    void checkForUpdate();
  }, [loaded, locked, loadAll, checkForUpdate]);

  // The splash screen in index.html covers this initial state.
  if (!loaded) return null;

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
            <WorkspaceDock />
          </main>
        </div>
      </div>
      <CommandPalette />
      <SnippetsDialog />
      <ShortcutsDialog />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster />
      <ThemeEffect />
    </TooltipProvider>
  );
}

export default App;
