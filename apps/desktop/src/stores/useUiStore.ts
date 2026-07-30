import { create } from "zustand";

export type ViewMode = "list" | "grid";
export type ThemeMode = "light" | "dark" | "system";

interface UiStore {
  searchQuery: string;
  selectedGroupId: string | null | "favorites";
  selectedTagId: string | null;
  viewMode: ViewMode;
  theme: ThemeMode;
  commandPaletteOpen: boolean;

  setSearchQuery: (query: string) => void;
  selectGroup: (groupId: string | null | "favorites") => void;
  selectTag: (tagId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

const storedTheme = (localStorage.getItem("theme") as ThemeMode | null) ?? "system";

export const useUiStore = create<UiStore>((set) => ({
  searchQuery: "",
  selectedGroupId: null,
  selectedTagId: null,
  viewMode: "list",
  theme: storedTheme,
  commandPaletteOpen: false,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  selectGroup: (selectedGroupId) => set({ selectedGroupId, selectedTagId: null }),
  selectTag: (selectedTagId) => set({ selectedTagId, selectedGroupId: null }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
