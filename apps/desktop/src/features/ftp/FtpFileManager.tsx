import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import type { FtpEntry, LocalEntry } from "@remotedesk/types";
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
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/tauri";
import type { FtpSession } from "@/stores/useFtpStore";
import { FtpPane, type PaneEntry } from "./FtpPane";
import { formatBytes, joinLocalPath, joinRemotePath, parentRemotePath } from "./format";

interface Transfer {
  id: string;
  direction: "upload" | "download";
  name: string;
  transferred: number;
  total: number | null;
  status: "active" | "done" | "error";
  error?: string;
}

interface DragPayload {
  side: "local" | "remote";
  entry: PaneEntry;
}

interface FtpFileManagerProps {
  session: FtpSession;
  visible: boolean;
}

export function FtpFileManager({ session, visible }: FtpFileManagerProps) {
  const [remotePath, setRemotePath] = useState("/");
  const [remoteEntries, setRemoteEntries] = useState<FtpEntry[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteSelected, setRemoteSelected] = useState<string | null>(null);

  const [localPath, setLocalPath] = useState("");
  const [localParent, setLocalParent] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(null);

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ side: "local" | "remote"; entry: PaneEntry } | null>(
    null,
  );

  const draggingRef = useRef<DragPayload | null>(null);
  const remotePathRef = useRef(remotePath);
  const localPathRef = useRef(localPath);
  const remotePaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    remotePathRef.current = remotePath;
  }, [remotePath]);
  useEffect(() => {
    localPathRef.current = localPath;
  }, [localPath]);

  async function loadRemote(path: string) {
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const entries = await api.ftp.list(session.id, path);
      setRemoteEntries(entries);
      setRemotePath(path);
    } catch (err) {
      setRemoteError(errorMessage(err));
    } finally {
      setRemoteLoading(false);
    }
  }

  async function loadLocal(path?: string) {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const listing = await api.local.listDir(path);
      setLocalEntries(listing.entries);
      setLocalPath(listing.path);
      setLocalParent(listing.parent);
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setLocalLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const pwd = await api.ftp.pwd(session.id);
        await loadRemote(pwd);
      } catch (err) {
        setRemoteError(errorMessage(err));
      }
    })();
    void loadLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Native OS drag-and-drop (e.g. dragging a file in from Finder/Explorer)
  // uploads into the remote pane when the drop lands inside its bounds.
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const rect = remotePaneRef.current?.getBoundingClientRect();
        if (!rect) return;
        const scale = window.devicePixelRatio || 1;
        const x = event.payload.position.x / scale;
        const y = event.payload.position.y / scale;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        for (const filePath of event.payload.paths) {
          void uploadAbsolutePath(filePath);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function updateTransfer(id: string, patch: Partial<Transfer>) {
    setTransfers((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTransfer(direction: Transfer["direction"], name: string, total: number | null): string {
    const id = crypto.randomUUID();
    setTransfers((list) => [
      ...list,
      { id, direction, name, transferred: 0, total, status: "active" },
    ]);
    return id;
  }

  async function startUpload(entry: PaneEntry) {
    if (entry.isDir) {
      toast.error("Uploading folders isn't supported yet — only single files.");
      return;
    }
    const localFull = joinLocalPath(localPathRef.current, entry.name);
    const remoteFull = joinRemotePath(remotePathRef.current, entry.name);
    const id = addTransfer("upload", entry.name, entry.size || null);
    try {
      await api.ftp.upload(session.id, localFull, remoteFull, (event) => {
        if (event.type === "progress") {
          updateTransfer(id, { transferred: event.transferred, total: event.total ?? entry.size });
        } else if (event.type === "completed") {
          updateTransfer(id, { status: "done" });
          void loadRemote(remotePathRef.current);
        } else if (event.type === "failed") {
          updateTransfer(id, { status: "error", error: event.message });
          toast.error(`Upload failed: ${event.message}`);
        }
      });
    } catch (err) {
      updateTransfer(id, { status: "error", error: errorMessage(err) });
      toast.error(errorMessage(err));
    }
  }

  async function uploadAbsolutePath(fullPath: string) {
    const name = fullPath.split(/[\\/]/).pop() ?? fullPath;
    const remoteFull = joinRemotePath(remotePathRef.current, name);
    const id = addTransfer("upload", name, null);
    try {
      await api.ftp.upload(session.id, fullPath, remoteFull, (event) => {
        if (event.type === "progress") {
          updateTransfer(id, { transferred: event.transferred, total: event.total });
        } else if (event.type === "completed") {
          updateTransfer(id, { status: "done" });
          void loadRemote(remotePathRef.current);
        } else if (event.type === "failed") {
          updateTransfer(id, { status: "error", error: event.message });
          toast.error(`Upload failed: ${event.message}`);
        }
      });
    } catch (err) {
      updateTransfer(id, { status: "error", error: errorMessage(err) });
      toast.error(errorMessage(err));
    }
  }

  async function startDownload(entry: PaneEntry) {
    if (entry.isDir) {
      toast.error("Downloading folders isn't supported yet — only single files.");
      return;
    }
    const remoteFull = joinRemotePath(remotePathRef.current, entry.name);
    const localFull = joinLocalPath(localPathRef.current, entry.name);
    const id = addTransfer("download", entry.name, entry.size || null);
    try {
      await api.ftp.download(session.id, remoteFull, localFull, (event) => {
        if (event.type === "progress") {
          updateTransfer(id, { transferred: event.transferred, total: event.total ?? entry.size });
        } else if (event.type === "completed") {
          updateTransfer(id, { status: "done" });
          void loadLocal(localPathRef.current);
        } else if (event.type === "failed") {
          updateTransfer(id, { status: "error", error: event.message });
          toast.error(`Download failed: ${event.message}`);
        }
      });
    } catch (err) {
      updateTransfer(id, { status: "error", error: errorMessage(err) });
      toast.error(errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { side, entry } = deleteTarget;
    try {
      if (side === "local") {
        await api.local.delete(joinLocalPath(localPathRef.current, entry.name), entry.isDir);
        await loadLocal(localPathRef.current);
      } else {
        if (entry.isDir) {
          await api.ftp.rmdir(session.id, joinRemotePath(remotePathRef.current, entry.name));
        } else {
          await api.ftp.delete(session.id, joinRemotePath(remotePathRef.current, entry.name));
        }
        await loadRemote(remotePathRef.current);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteTarget(null);
    }
  }

  const activeTransfers = transfers.filter((t) => t.status === "active");
  const finishedTransfers = transfers.filter((t) => t.status !== "active");

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      style={{ display: visible ? "flex" : "none" }}
    >
      <div className="flex min-h-0 flex-1">
        <FtpPane
          side="local"
          title="This computer"
          path={localPath}
          entries={localEntries}
          loading={localLoading}
          error={localError}
          selectedName={localSelected}
          onSelect={setLocalSelected}
          onNavigate={(name) => void loadLocal(joinLocalPath(localPath, name))}
          onUp={() => void loadLocal(localParent ?? localPath)}
          onRefresh={() => void loadLocal(localPath)}
          onPathSubmit={(path) => void loadLocal(path)}
          onNewFolder={(name) =>
            api.local
              .mkdir(joinLocalPath(localPath, name))
              .then(() => loadLocal(localPath))
              .catch((err) => toast.error(errorMessage(err)))
          }
          onRename={(entry, newName) =>
            api.local
              .rename(joinLocalPath(localPath, entry.name), joinLocalPath(localPath, newName))
              .then(() => loadLocal(localPath))
              .catch((err) => toast.error(errorMessage(err)))
          }
          onDelete={(entry) => setDeleteTarget({ side: "local", entry })}
          onTransfer={(entry) => void startUpload(entry)}
          onDragStartEntry={(entry) => {
            draggingRef.current = { side: "local", entry };
          }}
          onDropHere={() => {
            const dragged = draggingRef.current;
            draggingRef.current = null;
            if (dragged?.side === "remote") void startDownload(dragged.entry);
          }}
        />

        <FtpPane
          side="remote"
          title={session.serverName}
          path={remotePath}
          entries={remoteEntries}
          loading={remoteLoading}
          error={remoteError}
          selectedName={remoteSelected}
          onSelect={setRemoteSelected}
          onNavigate={(name) => void loadRemote(joinRemotePath(remotePath, name))}
          onUp={() => void loadRemote(parentRemotePath(remotePath))}
          onRefresh={() => void loadRemote(remotePath)}
          onPathSubmit={(path) => void loadRemote(path)}
          onNewFolder={(name) =>
            api.ftp
              .mkdir(session.id, joinRemotePath(remotePath, name))
              .then(() => loadRemote(remotePath))
              .catch((err) => toast.error(errorMessage(err)))
          }
          onRename={(entry, newName) =>
            api.ftp
              .rename(
                session.id,
                joinRemotePath(remotePath, entry.name),
                joinRemotePath(remotePath, newName),
              )
              .then(() => loadRemote(remotePath))
              .catch((err) => toast.error(errorMessage(err)))
          }
          onDelete={(entry) => setDeleteTarget({ side: "remote", entry })}
          onTransfer={(entry) => void startDownload(entry)}
          onDragStartEntry={(entry) => {
            draggingRef.current = { side: "remote", entry };
          }}
          onDropHere={() => {
            const dragged = draggingRef.current;
            draggingRef.current = null;
            if (dragged?.side === "local") void startUpload(dragged.entry);
          }}
          containerRef={(el) => {
            remotePaneRef.current = el;
          }}
        />
      </div>

      {transfers.length > 0 && (
        <div className="max-h-40 shrink-0 overflow-y-auto border-t bg-muted/30 text-xs">
          {activeTransfers.map((t) => (
            <TransferRow key={t.id} transfer={t} />
          ))}
          {finishedTransfers.map((t) => (
            <TransferRow
              key={t.id}
              transfer={t}
              onDismiss={() => setTransfers((list) => list.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.entry.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.entry.isDir
                ? "This removes the folder and everything inside it. This cannot be undone."
                : "This cannot be undone."}
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

function TransferRow({ transfer, onDismiss }: { transfer: Transfer; onDismiss?: () => void }) {
  const percent =
    transfer.total && transfer.total > 0
      ? Math.min(100, Math.round((transfer.transferred / transfer.total) * 100))
      : null;

  return (
    <div className="flex items-center gap-2 border-b px-3 py-1.5 last:border-b-0">
      {transfer.direction === "upload" ? (
        <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 text-blue-500" />
      ) : (
        <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      )}
      <span className="min-w-0 max-w-48 flex-1 truncate">{transfer.name}</span>

      {transfer.status === "active" && (
        <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: percent !== null ? `${percent}%` : "35%" }}
          />
        </div>
      )}

      <span className="w-28 shrink-0 text-right text-muted-foreground">
        {transfer.status === "error"
          ? (transfer.error ?? "Failed")
          : transfer.status === "done"
            ? "Done"
            : percent !== null
              ? `${percent}% · ${formatBytes(transfer.transferred)}`
              : formatBytes(transfer.transferred)}
      </span>

      {onDismiss && (
        <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
