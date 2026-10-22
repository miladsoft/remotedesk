import { useMemo, useState } from "react";
import { CornerDownLeft, Pencil, Play, Plus, Search, TextCursorInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTerminal } from "@/features/terminal/registry";
import { useSnippetStore, type Snippet } from "@/stores/useSnippetStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useUiStore } from "@/stores/useUiStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type Draft = { id: string | null; name: string; command: string };

export function SnippetsDialog() {
  const open = useUiStore((s) => s.snippetsOpen);
  const setOpen = useUiStore((s) => s.setSnippetsOpen);
  const snippets = useSnippetStore((s) => s.snippets);
  const addSnippet = useSnippetStore((s) => s.addSnippet);
  const updateSnippet = useSnippetStore((s) => s.updateSnippet);
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet);
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const sessions = useTerminalStore((s) => s.sessions);

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const target =
    activeTab?.type === "terminal"
      ? sessions.find((s) => s.id === activeTab.id && s.status === "open")
      : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q),
    );
  }, [snippets, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setDraft(null);
    }
  }

  function send(snippet: Snippet, mode: "insert" | "run") {
    const terminal = target && getTerminal(target.id);
    if (!terminal) {
      toast.error("Open a terminal session first");
      return;
    }
    handleOpenChange(false);
    // Let the dialog release focus before the terminal takes it back.
    requestAnimationFrame(() => terminal[mode](snippet.command));
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.command.trim()) {
      toast.error("A snippet needs a name and a command");
      return;
    }
    if (draft.id) updateSnippet(draft.id, draft.name, draft.command);
    else addSnippet(draft.name, draft.command);
    setDraft(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Snippets</DialogTitle>
          <DialogDescription>
            {target
              ? `Saved commands — insert or run them in “${target.serverName}”.`
              : "Saved commands. Open a terminal session to insert or run them."}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="snippet-name">Name</Label>
              <Input
                id="snippet-name"
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Restart nginx"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="snippet-command">Command</Label>
              <Textarea
                id="snippet-command"
                rows={4}
                spellCheck={false}
                className="font-mono text-xs"
                value={draft.command}
                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                placeholder="sudo systemctl restart nginx"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    saveDraft();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={saveDraft}>{draft.id ? "Save" : "Add snippet"}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search snippets…"
                  className="pl-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0]) {
                      e.preventDefault();
                      send(filtered[0], e.metaKey || e.ctrlKey ? "run" : "insert");
                    }
                  }}
                />
              </div>
              <Button variant="outline" onClick={() => setDraft({ id: null, name: "", command: "" })}>
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>

            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {snippets.length === 0 ? "No snippets yet — add your first one." : "No matching snippets."}
                </p>
              )}
              {filtered.map((snippet) => (
                <div
                  key={snippet.id}
                  className="group/snippet flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{snippet.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{snippet.command}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Insert at prompt"
                      disabled={!target}
                      onClick={() => send(snippet, "insert")}
                    >
                      <TextCursorInput className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Run now"
                      disabled={!target}
                      onClick={() => send(snippet, "run")}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover/snippet:opacity-100"
                      title="Edit"
                      onClick={() => setDraft({ id: snippet.id, name: snippet.name, command: snippet.command })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive opacity-0 group-hover/snippet:opacity-100"
                      title="Delete"
                      onClick={() => deleteSnippet(snippet.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" /> inserts the first match ·{" "}
              {navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl"}+Enter runs it
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
