import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Star,
  MoreVertical,
  Pencil,
  Trash2,
  KeyRound,
  ServerOff,
} from "lucide-react";
import type { Server } from "@remotedesk/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useServerStore } from "@/stores/useServerStore";
import { useUiStore } from "@/stores/useUiStore";
import { errorMessage } from "@/lib/tauri";
import { ServerFormDialog } from "./ServerFormDialog";
import { RevealCredentialDialog } from "./RevealCredentialDialog";

const PROTOCOL_LABELS: Record<Server["protocol"], string> = {
  ssh: "SSH",
  sftp: "SFTP",
  rdp: "RDP",
  vnc: "VNC",
  local_shell: "Shell",
  custom_command: "Custom",
};

export function ServerList() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const updateServer = useServerStore((s) => s.updateServer);
  const deleteServer = useServerStore((s) => s.deleteServer);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const selectedTagId = useUiStore((s) => s.selectedTagId);

  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealServer, setRevealServer] = useState<Server | null>(null);
  const [deletingServer, setDeletingServer] = useState<Server | null>(null);

  const groupNameById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const filtered = useMemo(() => {
    let list = servers;
    if (selectedGroupId === "favorites") {
      list = list.filter((s) => s.isFavorite);
    } else if (selectedGroupId) {
      list = list.filter((s) => s.groupId === selectedGroupId);
    }
    if (selectedTagId) {
      list = list.filter((s) => s.tagIds.includes(selectedTagId));
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.hostname.toLowerCase().includes(query) ||
          (s.username ?? "").toLowerCase().includes(query),
      );
    }
    return list;
  }, [servers, selectedGroupId, selectedTagId, searchQuery]);

  async function toggleFavorite(server: Server) {
    try {
      await updateServer(server.id, {
        name: server.name,
        description: server.description,
        hostname: server.hostname,
        port: server.port,
        protocol: server.protocol,
        username: server.username,
        authenticationType: server.authenticationType,
        secret: null,
        privateKeyPath: server.privateKeyPath,
        groupId: server.groupId,
        jumpServerId: server.jumpServerId,
        workingDirectory: server.workingDirectory,
        terminalProfileId: server.terminalProfileId,
        isFavorite: !server.isFavorite,
        tagIds: server.tagIds,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deletingServer) return;
    try {
      await deleteServer(deletingServer.id);
      toast.success(`Deleted "${deletingServer.name}"`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeletingServer(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {filtered.length} connection{filtered.length === 1 ? "" : "s"}
        </h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + New Connection
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ServerOff className="h-8 w-8" />
            <p className="text-sm">No connections here yet.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((server) => (
              <li
                key={server.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50"
              >
                <button onClick={() => toggleFavorite(server)} className="shrink-0">
                  <Star
                    className={cnStar(server.isFavorite)}
                    fill={server.isFavorite ? "currentColor" : "none"}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{server.name}</span>
                    <Badge variant="secondary">{PROTOCOL_LABELS[server.protocol]}</Badge>
                    {server.groupId && groupNameById.get(server.groupId) && (
                      <Badge variant="outline">{groupNameById.get(server.groupId)}</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {server.username ? `${server.username}@` : ""}
                    {server.hostname}:{server.port}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingServer(server)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {server.credentialReference && (
                      <DropdownMenuItem onClick={() => setRevealServer(server)}>
                        <KeyRound className="mr-2 h-4 w-4" /> Reveal credential
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeletingServer(server)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ServerFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ServerFormDialog
        open={editingServer !== null}
        onOpenChange={(open) => !open && setEditingServer(null)}
        server={editingServer ?? undefined}
      />
      <RevealCredentialDialog server={revealServer} onOpenChange={(open) => !open && setRevealServer(null)} />

      <AlertDialog open={deletingServer !== null} onOpenChange={(open) => !open && setDeletingServer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingServer?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the connection profile and its stored credential. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function cnStar(favorite: boolean) {
  return favorite
    ? "h-4 w-4 text-yellow-500"
    : "h-4 w-4 text-muted-foreground hover:text-yellow-500";
}
