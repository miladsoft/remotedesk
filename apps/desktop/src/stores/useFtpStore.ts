import { create } from "zustand";
import type { Server } from "@remotedesk/types";
import { api } from "@/lib/tauri";
import { useWorkspaceStore } from "./useWorkspaceStore";

export interface FtpSession {
  id: string;
  serverId: string;
  serverName: string;
}

interface FtpStore {
  sessions: FtpSession[];

  connect: (server: Server) => Promise<string>;
  disconnect: (sessionId: string) => Promise<void>;
  removeSession: (sessionId: string) => void;
}

export const useFtpStore = create<FtpStore>((set, get) => ({
  sessions: [],

  connect: async (server) => {
    const sessionId = await api.ftp.connect(server.id);
    set((s) => ({
      sessions: [...s.sessions, { id: sessionId, serverId: server.id, serverName: server.name }],
    }));
    useWorkspaceStore.getState().addTab({ type: "ftp", id: sessionId });
    return sessionId;
  },

  disconnect: async (sessionId) => {
    try {
      await api.ftp.disconnect(sessionId);
    } finally {
      get().removeSession(sessionId);
    }
  },

  removeSession: (sessionId) => {
    set((s) => ({ sessions: s.sessions.filter((session) => session.id !== sessionId) }));
    useWorkspaceStore.getState().removeTab({ type: "ftp", id: sessionId });
  },
}));
