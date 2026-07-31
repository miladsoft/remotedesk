import { useState } from "react";
import { Copy } from "lucide-react";
import type { Server } from "@remotedesk/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/tauri";
import { toast } from "sonner";

interface RevealCredentialDialogProps {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
}

export function RevealCredentialDialog({ server, onOpenChange }: RevealCredentialDialogProps) {
  const [passphrase, setPassphrase] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPassphrase("");
    setSecret(null);
    setError(null);
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!server) return;
    setSubmitting(true);
    setError(null);
    try {
      const revealed = await api.servers.revealCredential(server.id, passphrase);
      setSecret(revealed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={server !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal credential</DialogTitle>
          <DialogDescription>
            Confirm your app-lock passphrase to reveal the stored secret for{" "}
            <strong>{server?.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {secret === null ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reveal-passphrase">Lock passphrase</Label>
              <Input
                id="reveal-passphrase"
                type="password"
                autoFocus
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || passphrase.length === 0}>
                Reveal
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={secret} />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret);
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
