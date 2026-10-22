import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/useUiStore";

const isMac = navigator.userAgent.includes("Mac");
const isWindows = navigator.userAgent.includes("Windows");
const mod = isMac ? "⌘" : "Ctrl";
const termMod = isMac ? "⌘" : "Ctrl+Shift";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["Quick connect", `${mod}+K`],
      ["Snippets", `${mod}+Shift+S`],
      ["Keyboard shortcuts", isMac ? "⌘+/" : "Ctrl+Shift+/"],
    ],
  },
  {
    title: "Tabs",
    items: [
      ["Go to tab 1–8", `${mod}+1…8`],
      ["Go to last tab", `${mod}+9`],
      ["Next / previous tab", "Ctrl+Tab / Ctrl+Shift+Tab"],
    ],
  },
  {
    title: "Terminal",
    items: [
      ["Copy selection", isMac ? "⌘+C" : "Ctrl+Shift+C · Ctrl+C with a selection"],
      ["Paste", isMac ? "⌘+V" : `Ctrl+Shift+V · Shift+Insert${isWindows ? " · Ctrl+V" : ""}`],
      ["Select all", `${termMod}+A`],
      ["Find", `${termMod}+F`],
      ["Zoom in / out / reset", `${mod}+= / ${mod}+− / ${mod}+0`],
      ["Open link", `${mod}+click`],
      ["Reconnect ended session", "Enter"],
      ...(!isMac && !isWindows ? ([["Paste (middle click)", "Middle mouse button"]] as [string, string][]) : []),
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without reaching for the mouse.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>
              {group.items.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-4 text-sm">
                  <span>{label}</span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {keys}
                  </kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
