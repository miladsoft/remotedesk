import { useState } from "react";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AboutDialog } from "./AboutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLockStore } from "@/stores/useLockStore";
import { useUiStore, type ThemeMode } from "@/stores/useUiStore";
import { api, errorMessage } from "@/lib/tauri";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const passphraseSet = useLockStore((s) => s.passphraseSet);
  const idleTimeoutMinutes = useLockStore((s) => s.idleTimeoutMinutes);
  const setPassphrase = useLockStore((s) => s.setPassphrase);
  const clearPassphrase = useLockStore((s) => s.clearPassphrase);
  const setIdleTimeoutMinutes = useLockStore((s) => s.setIdleTimeoutMinutes);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [newPassphrase, setNewPassphrase] = useState("");
  const [savingPassphrase, setSavingPassphrase] = useState(false);

  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  async function handleSetPassphrase() {
    setSavingPassphrase(true);
    try {
      await setPassphrase(newPassphrase);
      setNewPassphrase("");
      toast.success("Lock passphrase updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPassphrase(false);
    }
  }

  async function handleClearPassphrase() {
    try {
      await clearPassphrase();
      toast.success("Lock passphrase removed");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleExport() {
    if (!exportPassphrase) {
      toast.error("Choose a passphrase to encrypt the backup with");
      return;
    }
    const path = await save({
      title: "Export RemoteDesk backup",
      defaultPath: "remotedesk-backup.smbk",
      filters: [{ name: "RemoteDesk Backup", extensions: ["smbk"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await api.backup.export(path, { includeCredentials, passphrase: exportPassphrase });
      toast.success("Backup exported");
      setExportPassphrase("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importPassphrase) {
      toast.error("Enter the backup's passphrase");
      return;
    }
    const path = await openDialog({
      title: "Import RemoteDesk backup",
      multiple: false,
      filters: [{ name: "RemoteDesk Backup", extensions: ["smbk"] }],
    });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    try {
      const summary = await api.backup.import(path, importPassphrase);
      toast.success(
        `Imported ${summary.serversImported} server(s), ${summary.groupsImported} group(s), ${summary.tagsImported} tag(s)`,
      );
      setImportPassphrase("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <DialogDescription>
            Manage app lock, appearance, and encrypted backups.
          </DialogDescription>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Appearance</h3>
            <Select value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">App lock</h3>
            <p className="text-sm text-muted-foreground">
              {passphraseSet
                ? "A lock passphrase is set. The app locks on launch and after idle timeout, and is required again to reveal any stored password."
                : "No lock passphrase is set. Consider setting one — it's required before any stored password can be revealed."}
            </p>
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="new-passphrase">
                  {passphraseSet ? "New passphrase" : "Set a passphrase"}
                </Label>
                <Input
                  id="new-passphrase"
                  type="password"
                  value={newPassphrase}
                  onChange={(e) => setNewPassphrase(e.target.value)}
                />
              </div>
              <Button
                onClick={handleSetPassphrase}
                disabled={savingPassphrase || newPassphrase.length === 0}
              >
                Save
              </Button>
            </div>
            {passphraseSet && (
              <Button variant="outline" size="sm" className="self-start" onClick={handleClearPassphrase}>
                Remove lock passphrase
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="idle-timeout" className="whitespace-nowrap">
                Auto-lock after (minutes)
              </Label>
              <Input
                id="idle-timeout"
                type="number"
                min={1}
                className="w-24"
                value={idleTimeoutMinutes}
                onChange={(e) => {
                  const minutes = Number(e.target.value);
                  if (minutes >= 1) void setIdleTimeoutMinutes(minutes);
                }}
              />
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Encrypted export</h3>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeCredentials}
                onCheckedChange={(v) => setIncludeCredentials(Boolean(v))}
              />
              Include stored passwords in the backup
            </label>
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="export-passphrase">Backup passphrase</Label>
                <Input
                  id="export-passphrase"
                  type="password"
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                />
              </div>
              <Button onClick={handleExport} disabled={busy}>
                Export…
              </Button>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Import backup</h3>
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="import-passphrase">Backup passphrase</Label>
                <Input
                  id="import-passphrase"
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                />
              </div>
              <Button onClick={handleImport} disabled={busy}>
                Import…
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 justify-between border-t bg-muted/50 p-4">
          <Button variant="ghost" size="sm" onClick={() => setAboutOpen(true)}>
            About RemoteDesk
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </Dialog>
  );
}
