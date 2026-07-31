import { Search, Settings, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/useUiStore";
import { useLockStore } from "@/stores/useLockStore";

interface TopbarProps {
  onOpenSettings: () => void;
}

export function Topbar({ onOpenSettings }: TopbarProps) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const passphraseSet = useLockStore((s) => s.passphraseSet);
  const lock = useLockStore((s) => s.lock);

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
