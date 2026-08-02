import { useEffect, useState, type KeyboardEvent } from "react";
import {
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Folder,
  File as FileIcon,
  MoreVertical,
  Download,
  Upload,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatBytes, formatModified } from "./format";

export interface PaneEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
}

interface FtpPaneProps {
  side: "local" | "remote";
  title: string;
  path: string;
  entries: PaneEntry[];
  loading: boolean;
  error: string | null;
  selectedName: string | null;
  onSelect: (name: string | null) => void;
  onNavigate: (name: string) => void;
  onUp: () => void;
  onRefresh: () => void;
  onPathSubmit: (path: string) => void;
  onNewFolder: (name: string) => void;
  onRename: (entry: PaneEntry, newName: string) => void;
  onDelete: (entry: PaneEntry) => void;
  onTransfer: (entry: PaneEntry) => void;
  onDragStartEntry: (entry: PaneEntry) => void;
  onDropHere: () => void;
  containerRef?: (el: HTMLDivElement | null) => void;
}

export function FtpPane({
  side,
  title,
  path,
  entries,
  loading,
  error,
  selectedName,
  onSelect,
  onNavigate,
  onUp,
  onRefresh,
  onPathSubmit,
  onNewFolder,
  onRename,
  onDelete,
  onTransfer,
  onDragStartEntry,
  onDropHere,
  containerRef,
}: FtpPaneProps) {
  const [pathDraft, setPathDraft] = useState(path);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setPathDraft(path);
  }, [path]);

  function submitNewFolder() {
    const name = newFolderName.trim();
    if (name) onNewFolder(name);
    setCreatingFolder(false);
    setNewFolderName("");
  }

  function submitRename(entry: PaneEntry) {
    const name = renameValue.trim();
    if (name && name !== entry.name) onRename(entry, name);
    setRenamingName(null);
  }

  function onKeyDownCommit(e: KeyboardEvent<HTMLInputElement>, commit: () => void, cancel: () => void) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") cancel();
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-w-0 flex-1 flex-col border-border",
        side === "local" ? "border-r" : "",
        dragOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropHere();
      }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <span className="shrink-0 text-xs font-semibold uppercase text-muted-foreground">
          {title}
        </span>
        <Input
          id={`${side}-path-input`}
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onPathSubmit(pathDraft);
            else if (e.key === "Escape") setPathDraft(path);
          }}
          className="h-7 flex-1 text-xs"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Up" onClick={onUp}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Refresh" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="New folder"
          onClick={() => {
            setCreatingFolder(true);
            setNewFolderName("");
          }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => onSelect(null)}>
        {error && <p className="p-3 text-xs text-destructive">{error}</p>}
        {loading && (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}

        {creatingFolder && (
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={newFolderName}
              placeholder="New folder name"
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={submitNewFolder}
              onKeyDown={(e) => onKeyDownCommit(e, submitNewFolder, () => setCreatingFolder(false))}
              className="h-6 flex-1 text-xs"
            />
          </div>
        )}

        {!loading && entries.length === 0 && !creatingFolder && (
          <p className="p-3 text-xs text-muted-foreground">Empty folder.</p>
        )}

        {entries.map((entry) => {
          const isSelected = selectedName === entry.name;
          const isRenaming = renamingName === entry.name;
          return (
            <div
              key={entry.name}
              draggable={!isRenaming}
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStartEntry(entry);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(entry.name);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (entry.isDir) onNavigate(entry.name);
              }}
              className={cn(
                "group/entry flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
                isSelected && "bg-accent",
              )}
            >
              {entry.isDir ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              ) : (
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}

              {isRenaming ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => submitRename(entry)}
                  onKeyDown={(e) =>
                    onKeyDownCommit(e, () => submitRename(entry), () => setRenamingName(null))
                  }
                  className="h-6 flex-1 text-xs"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              )}

              {!entry.isDir && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(entry.size)}
                </span>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatModified(entry.modified)}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover/entry:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!entry.isDir && (
                    <DropdownMenuItem onClick={() => onTransfer(entry)}>
                      {side === "local" ? (
                        <>
                          <Upload className="mr-2 h-4 w-4" /> Upload
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      setRenamingName(entry.name);
                      setRenameValue(entry.name);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(entry)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
