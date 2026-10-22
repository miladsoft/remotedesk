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
import { connectToServer } from "@/lib/connect";
import { recentServerIds } from "@/lib/recent";

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const allServers = useServerStore((s) => s.servers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Server[]>([]);
  const [recent, setRecent] = useState<Server[]>([]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      const byId = new Map(allServers.map((s) => [s.id, s]));
      const recentServers = recentServerIds()
        .map((id) => byId.get(id))
        .filter((s): s is Server => s !== undefined)
        .slice(0, 5);
      const recentIds = new Set(recentServers.map((s) => s.id));
      setRecent(recentServers);
      setResults(allServers.filter((s) => s.isFavorite && !recentIds.has(s.id)).slice(0, 8));
      return;
    }
    setRecent([]);
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

  function renderItem(server: Server) {
    return (
      <CommandItem
        key={server.id}
        value={server.id}
        onSelect={() => {
          handleOpenChange(false);
          void connectToServer(server);
        }}
      >
        <span className="font-medium">{server.name}</span>
        <span className="ml-2 text-muted-foreground">
          {server.username ? `${server.username}@` : ""}
          {server.hostname}
        </span>
        <span className="ml-auto text-[10px] tracking-wide text-muted-foreground uppercase">
          {server.protocol.replace("_", " ")}
        </span>
      </CommandItem>
    );
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
        {recent.length > 0 && (
          <CommandGroup heading="Recent">{recent.map(renderItem)}</CommandGroup>
        )}
        {results.length > 0 && (
          <CommandGroup heading={query.trim() ? "Results" : "Favorites"}>
            {results.map(renderItem)}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
