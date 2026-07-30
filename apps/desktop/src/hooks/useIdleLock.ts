import { useEffect, useRef } from "react";
import { useLockStore } from "@/stores/useLockStore";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;

/** Locks the app after `idleTimeoutMinutes` of no user activity, whenever a
 *  lock passphrase is configured. */
export function useIdleLock() {
  const passphraseSet = useLockStore((s) => s.passphraseSet);
  const idleTimeoutMinutes = useLockStore((s) => s.idleTimeoutMinutes);
  const locked = useLockStore((s) => s.locked);
  const lock = useLockStore((s) => s.lock);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!passphraseSet || locked) {
      return;
    }

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void lock();
      }, idleTimeoutMinutes * 60_000);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset);
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [passphraseSet, idleTimeoutMinutes, locked, lock]);
}
