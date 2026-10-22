import { getVersion } from "@tauri-apps/api/app";

/** The splash should feel intentional, not flicker past on a fast machine. */
const MIN_VISIBLE_MS = 1100;
/** Never trap the user behind the splash if startup throws somewhere. */
const FAILSAFE_MS = 10_000;
const FADE_MS = 450;

let hidden = false;

/** Fills in the version label and arms the failsafe. Call once at startup. */
export function initSplash() {
  getVersion()
    .then((version) => {
      const label = document.getElementById("splash-version");
      if (label) label.textContent = `Version ${version}`;
    })
    .catch(() => {});
  window.setTimeout(hideSplash, FAILSAFE_MS);
}

/** Fades the splash out (after its minimum display time) and removes it. Idempotent. */
export function hideSplash() {
  if (hidden) return;
  hidden = true;
  const splash = document.getElementById("splash");
  if (!splash) return;
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    splash.classList.add("splash-hide");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, wait);
}
