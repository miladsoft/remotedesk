import { create } from "zustand";

/** What a right-click inside the terminal does. */
export type RightClickAction = "menu" | "copyPaste";

export const MIN_TERMINAL_FONT_SIZE = 9;
export const MAX_TERMINAL_FONT_SIZE = 28;
export const DEFAULT_TERMINAL_FONT_SIZE = 13;

interface TerminalSettings {
  fontSize: number;
  /** Id from `TERMINAL_THEMES`. */
  themeId: string;
  /** Copy the selection to the clipboard as soon as it's made (PuTTY/iTerm style). */
  copyOnSelect: boolean;
  rightClickAction: RightClickAction;
  /** Ask before pasting text that spans several lines, which a shell would run line by line. */
  confirmMultilinePaste: boolean;
}

interface TerminalSettingsStore extends TerminalSettings {
  setFontSize: (size: number) => void;
  setThemeId: (themeId: string) => void;
  setCopyOnSelect: (enabled: boolean) => void;
  setRightClickAction: (action: RightClickAction) => void;
  setConfirmMultilinePaste: (enabled: boolean) => void;
}

const STORAGE_KEY = "terminalSettings";

const defaults: TerminalSettings = {
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  themeId: "default",
  copyOnSelect: false,
  rightClickAction: "menu",
  confirmMultilinePaste: true,
};

function load(): TerminalSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<TerminalSettings>;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

export const useTerminalSettingsStore = create<TerminalSettingsStore>((set, get) => {
  const update = (patch: Partial<TerminalSettings>) => {
    set(patch);
    const { fontSize, themeId, copyOnSelect, rightClickAction, confirmMultilinePaste } = get();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fontSize, themeId, copyOnSelect, rightClickAction, confirmMultilinePaste }),
      );
    } catch {
      // Preferences are a convenience; failing to persist them isn't fatal.
    }
  };

  return {
    ...load(),
    setFontSize: (size) =>
      update({
        fontSize: Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(Math.round(size), MAX_TERMINAL_FONT_SIZE)),
      }),
    setThemeId: (themeId) => update({ themeId }),
    setCopyOnSelect: (copyOnSelect) => update({ copyOnSelect }),
    setRightClickAction: (rightClickAction) => update({ rightClickAction }),
    setConfirmMultilinePaste: (confirmMultilinePaste) => update({ confirmMultilinePaste }),
  };
});
