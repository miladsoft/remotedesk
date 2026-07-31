import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLockStore } from "@/stores/useLockStore";
import { errorMessage } from "@/lib/tauri";

export function LockScreen() {
  const unlock = useLockStore((s) => s.unlock);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await unlock(passphrase);
      setPassphrase("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/rd.png" alt="RemoteDesk" className="h-14 w-14 rounded-2xl" />
          <h1 className="flex items-center gap-1.5 text-lg font-semibold">
            <Lock className="h-4 w-4 text-muted-foreground" />
            RemoteDesk is locked
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your passphrase to unlock your saved connections.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="passphrase">Passphrase</Label>
          <Input
            id="passphrase"
            type="password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || passphrase.length === 0}>
          {submitting ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
