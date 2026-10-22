import { create } from "zustand";

export interface Snippet {
  id: string;
  name: string;
  command: string;
}

interface SnippetStore {
  snippets: Snippet[];
  addSnippet: (name: string, command: string) => void;
  updateSnippet: (id: string, name: string, command: string) => void;
  deleteSnippet: (id: string) => void;
}

const STORAGE_KEY = "snippets";

/** A few everyday commands so the panel is useful out of the box. */
const STARTER_SNIPPETS: Snippet[] = [
  { id: "starter-disk", name: "Disk usage", command: "df -h" },
  { id: "starter-memory", name: "Memory usage", command: "free -h" },
  { id: "starter-top", name: "Top processes by CPU", command: "ps aux --sort=-%cpu | head -n 15" },
  { id: "starter-ports", name: "Listening ports", command: "ss -tulpn" },
  { id: "starter-uptime", name: "Uptime & load", command: "uptime" },
];

function load(): Snippet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return STARTER_SNIPPETS;
    const parsed = JSON.parse(stored) as Snippet[];
    return Array.isArray(parsed) ? parsed : STARTER_SNIPPETS;
  } catch {
    return STARTER_SNIPPETS;
  }
}

export const useSnippetStore = create<SnippetStore>((set, get) => {
  const save = (snippets: Snippet[]) => {
    set({ snippets });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().snippets));
    } catch {
      // Not fatal: snippets just won't survive a restart.
    }
  };

  return {
    snippets: load(),
    addSnippet: (name, command) =>
      save([...get().snippets, { id: crypto.randomUUID(), name: name.trim(), command }]),
    updateSnippet: (id, name, command) =>
      save(get().snippets.map((s) => (s.id === id ? { ...s, name: name.trim(), command } : s))),
    deleteSnippet: (id) => save(get().snippets.filter((s) => s.id !== id)),
  };
});
