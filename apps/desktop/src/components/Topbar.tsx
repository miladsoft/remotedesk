import { Search, Settings, Lock, Keyboard, ScrollText, Download, RotateCw } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/useUiStore";
import { useLockStore } from "@/stores/useLockStore";
import { useUpdateStore } from "@/stores/useUpdateStore";

interface TopbarProps {
  onOpenSettings: () => void;
}

export function Topbar({ onOpenSettings }: TopbarProps) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const passphraseSet = useLockStore((s) => s.passphraseSet);
  const lock = useLockStore((s) => s.lock);
  const setSnippetsOpen = useUiStore((s) => s.setSnippetsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <img src="/rd.png" alt="RemoteDesk" className="h-5 w-5 shrink-0 rounded-md" />
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search servers…  (⌘K for quick connect)"
          className="pl-8"
        />
      </div>
      <div className="flex-1" />
      <UpdateButton />
      <Button variant="ghost" size="icon" title="Snippets" onClick={() => setSnippetsOpen(true)}>
        <ScrollText className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" title="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
        <Keyboard className="h-4 w-4" />
      </Button>
      {passphraseSet && (
        <Button variant="ghost" size="icon" title="Lock now" onClick={() => void lock()}>
          <Lock className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" title="Settings" onClick={onOpenSettings}>
        <Settings className="h-4 w-4" />
      </Button>
    </header>
  );
}

/** Stays visible while an update is pending, so dismissing the toast never
 *  loses it: install → live download progress → restart. */
function UpdateButton() {
  const phase = useUpdateStore((s) => s.phase);
  const available = useUpdateStore((s) => s.available);
  const progress = useUpdateStore((s) => s.progress);
  const installUpdate = useUpdateStore((s) => s.installUpdate);

  if (!available || (phase !== "available" && phase !== "downloading" && phase !== "ready")) {
    return null;
  }

  if (phase === "ready") {
    return (
      <Button size="sm" className="h-7 gap-1.5" onClick={() => void relaunch()}>
        <RotateCw className="h-3.5 w-3.5" /> Restart to update
      </Button>
    );
  }

  if (phase === "downloading") {
    return (
      <Button size="sm" variant="secondary" className="relative h-7 gap-1.5 overflow-hidden" disabled>
        <span
          className="absolute inset-y-0 left-0 bg-primary/15 transition-[width]"
          style={{ width: `${progress ?? 0}%` }}
        />
        <Download className="relative h-3.5 w-3.5 animate-pulse" />
        <span className="relative tabular-nums">
          {progress !== null ? `Downloading ${progress}%` : "Downloading…"}
        </span>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className="h-7 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
      title="Download and install the new version"
      onClick={() => void installUpdate()}
    >
      <Download className="h-3.5 w-3.5" /> Update to v{available.version}
    </Button>
  );
}
