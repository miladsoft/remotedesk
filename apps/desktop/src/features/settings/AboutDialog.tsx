import { openUrl } from "@tauri-apps/plugin-opener";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import pkg from "../../../package.json";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <img src="/rd.png" alt="RemoteDesk" className="h-16 w-16 rounded-2xl" />
          <div>
            <DialogTitle className="text-base font-semibold">RemoteDesk</DialogTitle>
            <p className="text-sm text-muted-foreground">Version {pkg.version}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            A cross-platform, local-first remote server connection manager.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => void openUrl("https://github.com/miladsoft/remotedesk")}
            >
              GitHub
            </button>
            <span>·</span>
            <span>MIT License</span>
            <span>·</span>
            <span>© {new Date().getFullYear()} Milad Raeisi</span>
          </div>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
