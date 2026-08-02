import { create } from "zustand";

/** A single open tab in the main dock — either a terminal session or an FTP file manager. */
export type WorkspaceTab = { type: "terminal"; id: string } | { type: "ftp"; id: string };

interface WorkspaceStore {
  tabs: WorkspaceTab[];
  activeTab: WorkspaceTab | null;
  addTab: (tab: WorkspaceTab) => void;
  removeTab: (tab: WorkspaceTab) => void;
  setActive: (tab: WorkspaceTab) => void;
}

function sameTab(a: WorkspaceTab | null, b: WorkspaceTab): boolean {
  return a !== null && a.type === b.type && a.id === b.id;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  tabs: [],
  activeTab: null,

  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTab: tab })),

  removeTab: (tab) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => !sameTab(t, tab));
      const activeTab = sameTab(s.activeTab, tab) ? (tabs[tabs.length - 1] ?? null) : s.activeTab;
      return { tabs, activeTab };
    }),

  setActive: (activeTab) => set({ activeTab }),
}));
