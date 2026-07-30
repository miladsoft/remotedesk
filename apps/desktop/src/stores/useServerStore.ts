import { create } from "zustand";
import type { Server, ServerGroup, ServerInput, Tag } from "@remotedesk/types";
import { api } from "@/lib/tauri";

interface ServerStore {
  servers: Server[];
  groups: ServerGroup[];
  tags: Tag[];
  loading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;

  createServer: (input: ServerInput) => Promise<Server>;
  updateServer: (id: string, input: ServerInput) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;

  createGroup: (input: Omit<ServerGroup, "id">) => Promise<ServerGroup>;
  updateGroup: (id: string, input: Omit<ServerGroup, "id">) => Promise<ServerGroup>;
  deleteGroup: (id: string) => Promise<void>;

  createTag: (name: string) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  groups: [],
  tags: [],
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [servers, groups, tags] = await Promise.all([
        api.servers.list(),
        api.groups.list(),
        api.tags.list(),
      ]);
      set({ servers, groups, tags, loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  createServer: async (input) => {
    const server = await api.servers.create(input);
    set({ servers: [...get().servers, server] });
    return server;
  },

  updateServer: async (id, input) => {
    const server = await api.servers.update(id, input);
    set({ servers: get().servers.map((s) => (s.id === id ? server : s)) });
    return server;
  },

  deleteServer: async (id) => {
    await api.servers.delete(id);
    set({ servers: get().servers.filter((s) => s.id !== id) });
  },

  createGroup: async (input) => {
    const group = await api.groups.create(input);
    set({ groups: [...get().groups, group] });
    return group;
  },

  updateGroup: async (id, input) => {
    const group = await api.groups.update(id, input);
    set({ groups: get().groups.map((g) => (g.id === id ? group : g)) });
    return group;
  },

  deleteGroup: async (id) => {
    await api.groups.delete(id);
    set({
      groups: get().groups.filter((g) => g.id !== id),
      servers: get().servers.map((s) => (s.groupId === id ? { ...s, groupId: null } : s)),
    });
  },

  createTag: async (name) => {
    const tag = await api.tags.create(name);
    if (!get().tags.some((t) => t.id === tag.id)) {
      set({ tags: [...get().tags, tag] });
    }
    return tag;
  },

  deleteTag: async (id) => {
    await api.tags.delete(id);
    set({
      tags: get().tags.filter((t) => t.id !== id),
      servers: get().servers.map((s) => ({
        ...s,
        tagIds: s.tagIds.filter((t) => t !== id),
      })),
    });
  },
}));
