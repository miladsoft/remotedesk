import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import {
  Star,
  Server as ServerIcon,
  FolderPlus,
  Folder,
  Tag as TagIcon,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  KeyRound,
  ServerOff,
  Plug,
} from "lucide-react";
import type { Server, ServerGroup } from "@remotedesk/types";
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
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/tauri";
import { connectToServer } from "@/lib/connect";
import { useServerStore } from "@/stores/useServerStore";
import { useUiStore } from "@/stores/useUiStore";
import { ServerFormDialog } from "./ServerFormDialog";
import { RevealCredentialDialog } from "./RevealCredentialDialog";
import { GroupFormDialog } from "./GroupFormDialog";

const PROTOCOL_LABELS: Record<Server["protocol"], string> = {
  ssh: "SSH",
  sftp: "SFTP",
  rdp: "RDP",
  vnc: "VNC",
  local_shell: "Shell",
  custom_command: "Custom",
};

function GroupNode({
  group,
  childrenByParent,
  depth,
}: {
  group: ServerGroup;
  childrenByParent: Map<string | null, ServerGroup[]>;
  depth: number;
}) {
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const children = childrenByParent.get(group.id) ?? [];

  return (
    <div>
      <button
        onClick={() => selectGroup(group.id)}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-accent",
          selectedGroupId === group.id && "bg-accent font-medium",
        )}
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{group.name}</span>
      </button>
      {children.map((child) => (
        <GroupNode key={child.id} group={child} childrenByParent={childrenByParent} depth={depth + 1} />
      ))}
    </div>
  );
}

function ResizeHandle() {
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.classList.add("select-none");
      document.body.style.cursor = "col-resize";

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        setSidebarWidth(ev.clientX);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.body.classList.remove("select-none");
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSidebarWidth],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      className="group relative z-10 w-1 shrink-0 cursor-col-resize bg-border"
    >
      <div className="absolute inset-y-0 -left-1.5 -right-1.5 group-hover:bg-primary/20" />
    </div>
  );
}

function ServerRow({ server, groupName }: { server: Server; groupName?: string }) {
  const updateServer = useServerStore((s) => s.updateServer);
  const deleteServer = useServerStore((s) => s.deleteServer);
  const [editingServer, setEditingServer] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleFavorite() {
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
    try {
      await deleteServer(server.id);
      toast.success(`Deleted "${server.name}"`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group/row flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent">
      <button onClick={() => void toggleFavorite()} className="shrink-0">
        <Star
          className={cn(
            "h-3.5 w-3.5",
            server.isFavorite ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500",
          )}
          fill={server.isFavorite ? "currentColor" : "none"}
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{server.name}</span>
          <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px]">
            {PROTOCOL_LABELS[server.protocol]}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {server.username ? `${server.username}@` : ""}
          {server.hostname}
          {groupName ? ` · ${groupName}` : ""}
        </p>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 opacity-0 group-hover/row:opacity-100"
        title="Connect"
        onClick={() => void connectToServer(server)}
      >
        <Plug className="h-3.5 w-3.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover/row:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44 whitespace-nowrap">
          <DropdownMenuItem onClick={() => void connectToServer(server)}>
            <Plug className="mr-2 h-4 w-4" /> Connect
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingServer(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          {server.credentialReference && (
            <DropdownMenuItem onClick={() => setRevealOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" /> Reveal credential
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ServerFormDialog open={editingServer} onOpenChange={setEditingServer} server={server} />
      <RevealCredentialDialog
        server={revealOpen ? server : null}
        onOpenChange={(open) => !open && setRevealOpen(false)}
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{server.name}"?</AlertDialogTitle>
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

export function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const selectedTagId = useUiStore((s) => s.selectedTagId);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const selectTag = useUiStore((s) => s.selectTag);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ServerGroup[]>();
    for (const group of groups) {
      const key = group.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return map;
  }, [groups]);

  const topLevelGroups = childrenByParent.get(null) ?? [];

  const groupNameById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const filteredServers = useMemo(() => {
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

  return (
    <div className="flex h-full shrink-0" style={{ width: sidebarWidth }}>
      <aside className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto border-r bg-sidebar px-2 py-4">
        <nav className="flex flex-col gap-0.5">
          <button
            onClick={() => selectGroup(null)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent",
              selectedGroupId === null && selectedTagId === null && "bg-accent font-medium",
            )}
          >
            <ServerIcon className="h-3.5 w-3.5 text-muted-foreground" />
            All servers
          </button>
          <button
            onClick={() => selectGroup("favorites")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent",
              selectedGroupId === "favorites" && "bg-accent font-medium",
            )}
          >
            <Star className="h-3.5 w-3.5 text-muted-foreground" />
            Favorites
          </button>
        </nav>

        <div className="mt-4">
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-xs font-medium uppercase text-muted-foreground">Groups</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setGroupDialogOpen(true)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {topLevelGroups.map((group) => (
              <GroupNode key={group.id} group={group} childrenByParent={childrenByParent} depth={0} />
            ))}
          </nav>
        </div>

        {tags.length > 0 && (
          <div className="mt-4">
            <div className="px-3 pb-1 text-xs font-medium uppercase text-muted-foreground">Tags</div>
            <nav className="flex flex-col gap-0.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => selectTag(tag.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent",
                    selectedTagId === tag.id && "bg-accent font-medium",
                  )}
                >
                  <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{tag.name}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Connections ({filteredServers.length})
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title="New connection"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {filteredServers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
              <ServerOff className="h-6 w-6" />
              <p className="text-xs">No connections here yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredServers.map((server) => (
                <ServerRow
                  key={server.id}
                  server={server}
                  groupName={server.groupId ? groupNameById.get(server.groupId) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <GroupFormDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} />
        <ServerFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      </aside>
      <ResizeHandle />
    </div>
  );
}
