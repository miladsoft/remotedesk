import { create } from "zustand";
import { api } from "@/lib/tauri";

interface LockStore {
  locked: boolean;
  passphraseSet: boolean;
  idleTimeoutMinutes: number;
  loaded: boolean;

  refresh: () => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
  setPassphrase: (passphrase: string) => Promise<void>;
  clearPassphrase: () => Promise<void>;
  setIdleTimeoutMinutes: (minutes: number) => Promise<void>;
}

export const useLockStore = create<LockStore>((set) => ({
  locked: false,
  passphraseSet: false,
  idleTimeoutMinutes: 15,
  loaded: false,

  refresh: async () => {
    const status = await api.lock.status();
    set({
      locked: status.locked,
      passphraseSet: status.passphraseSet,
      idleTimeoutMinutes: status.idleTimeoutMinutes,
      loaded: true,
    });
  },

  unlock: async (passphrase) => {
    await api.lock.unlock(passphrase);
    set({ locked: false });
  },

  lock: async () => {
    await api.lock.lock();
    set({ locked: true });
  },

  setPassphrase: async (passphrase) => {
    await api.lock.setPassphrase(passphrase);
    set({ passphraseSet: true });
  },

  clearPassphrase: async () => {
    await api.lock.clearPassphrase();
    set({ passphraseSet: false });
  },

  setIdleTimeoutMinutes: async (minutes) => {
    await api.lock.setIdleTimeoutMinutes(minutes);
    set({ idleTimeoutMinutes: minutes });
  },
}));
