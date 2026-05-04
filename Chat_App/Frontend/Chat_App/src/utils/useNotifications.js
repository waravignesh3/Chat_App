/**
 * useNotifications — Browser Push Notification + Sound hook
 * Requests permission on mount and exposes a notify() function.
 * Sound plays via a tiny AudioContext bleep (no asset file needed).
 */
import { useCallback, useEffect, useRef } from "react";

// Generates a short bleep using the Web Audio API — no asset file required
function playSoftBleep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext not available (e.g. SSR) — silently ignore
  }
}

export function useNotifications({ soundEnabled = true } = {}) {
  const permissionRef = useRef(Notification.permission);

  // Request permission once on mount
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    }
  }, []);

  /**
   * notify({ title, body, icon, tag, soundEnabled })
   * Shows a browser notification if permission granted and tab is hidden.
   * Always plays a bleep (respecting soundEnabled setting).
   */
  const notify = useCallback(
    ({ title = "New message", body = "", icon = "/favicon.ico", tag, sound = soundEnabled } = {}) => {
      // Sound — always plays when message arrives
      if (sound) playSoftBleep();

      // Browser notification — only when tab is not visible
      if (document.visibilityState !== "hidden") return;
      if (permissionRef.current !== "granted") return;

      const n = new Notification(title, {
        body,
        icon,
        tag: tag || "chat-message",
        badge: "/favicon.ico",
        silent: true, // we handle sound ourselves
      });

      // Auto-close after 5 s
      setTimeout(() => n.close(), 5000);

      // Focus the tab when user clicks the notification
      n.onclick = () => {
        window.focus();
        n.close();
      };
    },
    [soundEnabled]
  );

  return { notify };
}
