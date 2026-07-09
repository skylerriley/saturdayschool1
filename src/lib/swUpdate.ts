// Forces installed-PWA / open-tab clients off stale deploys.
//
// Background: vite.config.ts uses registerType:'autoUpdate' (Workbox skipWaiting +
// clientsClaim), so a new service worker activates on its own after a deploy — but a
// tab that's already open keeps running the OLD JS bundle in memory until the user
// manually reloads. This module closes that gap: when a new SW takes control we
// hard-reload the page, and we actively poll the server for new SWs so a tab left
// open for hours still notices a deploy without needing a navigation.
//
// Behavior chosen for this app: FULLY AUTOMATIC reload + periodic version polling,
// with a GUARDRAIL that defers the reload while the user is mid-score-entry so we
// never yank them out of a live scorecard. The reload fires the moment it's safe
// (they leave the Score Entry tab) — see setReloadBlocked() / registerReloadGuard().

import { registerSW } from 'virtual:pwa-register';

// How often to actively ask the browser to check the server for a new SW.
const UPDATE_POLL_MS = 3 * 60 * 1000; // 3 minutes

// Guardrail state. When blocked, we stash a "do it later" reload and fire it as
// soon as setReloadBlocked(false) is called (e.g. user leaves Score Entry).
let reloadBlocked = false;
let pendingReload = false;
let reloading = false;

function doReload() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function requestReload() {
  if (reloadBlocked) {
    // Defer: remember that a new version is live and reload once unblocked.
    pendingReload = true;
    return;
  }
  doReload();
}

/**
 * Block or unblock the auto-reload. Call setReloadBlocked(true) while the user is
 * actively entering scores (or any dirty form you don't want interrupted), and
 * setReloadBlocked(false) when they're done. If a new deploy landed while blocked,
 * unblocking triggers the reload immediately.
 */
export function setReloadBlocked(blocked: boolean) {
  reloadBlocked = blocked;
  if (!blocked && pendingReload) {
    pendingReload = false;
    doReload();
  }
}

export function initServiceWorkerAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // When the freshly-activated SW takes control of this page, reload so the tab
  // runs the new bundle. With skipWaiting+clientsClaim this fires shortly after a
  // new SW installs — no user action needed (subject to the guardrail).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // If there was no controller before (very first SW install on a fresh page
    // load), reloading would be pointless churn — the current bundle IS current.
    if (!navigator.serviceWorker.controller) return;
    requestReload();
  });

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const poll = () => {
        // Don't hammer the network while backgrounded; only check when visible.
        if (document.visibilityState !== 'visible') return;
        // reg.update() fetches the SW script; if it changed, the new SW installs,
        // activates (skipWaiting), claims clients → controllerchange → reload.
        registration.update().catch(() => { /* offline / transient — ignore */ });
      };

      // Periodic check for long-open tabs.
      setInterval(poll, UPDATE_POLL_MS);

      // Also check the moment the user returns to the app (common PWA pattern:
      // phone unlocked / app foregrounded after a deploy went out).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poll();
      });
      window.addEventListener('focus', poll);
    },
    onNeedRefresh() {
      // A new version is waiting. Apply it immediately (fully-automatic policy).
      // updateSW(true) tells the waiting SW to skipWaiting; on activation the
      // controllerchange handler above calls requestReload() (which respects the
      // guardrail and defers if the user is mid-score-entry).
      updateSW(true);
    },
  });
}
