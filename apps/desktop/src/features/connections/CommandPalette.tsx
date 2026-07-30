import { useEffect, useState } from "react";
import type { Server } from "@remotedesk/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUiStore } from "@/stores/useUiStore";
import { useServerStore } from "@/stores/useServerStore";
import { api } from "@/lib/tauri";

interface CommandPaletteProps {
  onSelectServer: (server: Server) => void;
}

export function CommandPalette({ onSelectServer }: CommandPaletteProps) {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const allServers = useServerStore((s) => s.servers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Server[]>([]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(allServers.filter((s) => s.isFavorite).slice(0, 8));
      return;
    }
    const handle = setTimeout(() => {
      api.servers.search(trimmed).then(setResults).catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(handle);
  }, [query, open, allServers]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Quick connect"
      description="Search your saved connections"
    >
      <CommandInput
        placeholder="Search servers by name, host, or user…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No connections found.</CommandEmpty>
        <CommandGroup heading={query.trim() ? "Results" : "Favorites"}>
          {results.map((server) => (
            <CommandItem
              key={server.id}
              value={server.id}
              onSelect={() => {
                onSelectServer(server);
                handleOpenChange(false);
              }}
            >
              <span className="font-medium">{server.name}</span>
              <span className="ml-2 text-muted-foreground">
                {server.username ? `${server.username}@` : ""}
                {server.hostname}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
