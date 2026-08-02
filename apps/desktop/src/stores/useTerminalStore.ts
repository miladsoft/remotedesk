import { create } from "zustand";
import type { PtyEvent, Server } from "@remotedesk/types";
import { api } from "@/lib/tauri";
import { useWorkspaceStore } from "./useWorkspaceStore";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  status: "open" | "closed";
  exitCode?: number;
}

type Listener = (event: PtyEvent) => void;

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  connect: (server: Server) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  removeSession: (sessionId: string) => void;
  setActive: (sessionId: string) => void;
  /** Imperative subscription for a TerminalPane to receive its session's pty events. */
  subscribe: (sessionId: string, listener: Listener) => () => void;
}

// Not part of zustand's reactive state — components subscribe imperatively
// so xterm.js instances aren't re-created on every store update.
const sessionListeners = new Map<string, Set<Listener>>();

function emit(sessionId: string, event: PtyEvent) {
  const listeners = sessionListeners.get(sessionId);
  if (listeners) {
    for (const listener of listeners) listener(event);
  }
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  connect: async (server) => {
    const idBox: { current: string | null } = { current: null };
    const backlog: PtyEvent[] = [];

    const onEvent = (event: PtyEvent) => {
      if (idBox.current === null) {
        backlog.push(event);
        return;
      }
      emit(idBox.current, event);
      if (event.type === "exited") {
        set((s) => ({
          sessions: s.sessions.map((session) =>
            session.id === idBox.current
              ? { ...session, status: "closed", exitCode: event.code }
              : session,
          ),
        }));
      }
    };

    const sessionId = await api.session.start(server.id, onEvent);
    idBox.current = sessionId;
    sessionListeners.set(sessionId, new Set());

    set((s) => ({
      sessions: [
        ...s.sessions,
        { id: sessionId, serverId: server.id, serverName: server.name, status: "open" },
      ],
      activeSessionId: sessionId,
    }));
    useWorkspaceStore.getState().addTab({ type: "terminal", id: sessionId });

    for (const event of backlog) emit(sessionId, event);
    return sessionId;
  },

  closeSession: async (sessionId) => {
    try {
      await api.session.close(sessionId);
    } finally {
      get().removeSession(sessionId);
    }
  },

  removeSession: (sessionId) => {
    sessionListeners.delete(sessionId);
    set((s) => {
      const sessions = s.sessions.filter((session) => session.id !== sessionId);
      const activeSessionId =
        s.activeSessionId === sessionId
          ? (sessions[sessions.length - 1]?.id ?? null)
          : s.activeSessionId;
      return { sessions, activeSessionId };
    });
    useWorkspaceStore.getState().removeTab({ type: "terminal", id: sessionId });
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

  subscribe: (sessionId, listener) => {
    let listeners = sessionListeners.get(sessionId);
    if (!listeners) {
      listeners = new Set();
      sessionListeners.set(sessionId, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  },
}));
