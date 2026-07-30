import { useMemo, useState } from "react";
import { Star, Server as ServerIcon, FolderPlus, Folder, Tag as TagIcon } from "lucide-react";
import type { ServerGroup } from "@remotedesk/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useServerStore } from "@/stores/useServerStore";
import { useUiStore } from "@/stores/useUiStore";
import { GroupFormDialog } from "./GroupFormDialog";

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

export function Sidebar() {
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const selectedTagId = useUiStore((s) => s.selectedTagId);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const selectTag = useUiStore((s) => s.selectTag);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, ServerGroup[]>();
    for (const group of groups) {
      const key = group.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return map;
  }, [groups]);

  const topLevelGroups = childrenByParent.get(null) ?? [];

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-sidebar px-2 py-4">
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

      <div>
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
        <div>
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

      <GroupFormDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} />
    </aside>
  );
}
