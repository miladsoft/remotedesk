import { create } from "zustand";

export type ViewMode = "list" | "grid";
export type ThemeMode = "light" | "dark" | "system";

export const MIN_SIDEBAR_WIDTH = 280;
export const MAX_SIDEBAR_WIDTH = 560;
const DEFAULT_SIDEBAR_WIDTH = 320;

interface UiStore {
  searchQuery: string;
  selectedGroupId: string | null | "favorites";
  selectedTagId: string | null;
  viewMode: ViewMode;
  theme: ThemeMode;
  commandPaletteOpen: boolean;
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  setSearchQuery: (query: string) => void;
  selectGroup: (groupId: string | null | "favorites") => void;
  selectTag: (tagId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const storedTheme = (localStorage.getItem("theme") as ThemeMode | null) ?? "system";

const storedSidebarWidth = Number(localStorage.getItem("sidebarWidth"));
const initialSidebarWidth =
  Number.isFinite(storedSidebarWidth) && storedSidebarWidth >= MIN_SIDEBAR_WIDTH
    ? storedSidebarWidth
    : DEFAULT_SIDEBAR_WIDTH;

const initialSidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";

export const useUiStore = create<UiStore>((set) => ({
  searchQuery: "",
  selectedGroupId: null,
  selectedTagId: null,
  viewMode: "list",
  theme: storedTheme,
  commandPaletteOpen: false,
  sidebarWidth: initialSidebarWidth,
  sidebarCollapsed: initialSidebarCollapsed,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  selectGroup: (selectedGroupId) => set({ selectedGroupId, selectedTagId: null }),
  selectTag: (selectedTagId) => set({ selectedTagId, selectedGroupId: null }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setSidebarWidth: (width) => {
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, MAX_SIDEBAR_WIDTH));
    localStorage.setItem("sidebarWidth", String(clamped));
    set({ sidebarWidth: clamped });
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
    set({ sidebarCollapsed });
  },
}));
