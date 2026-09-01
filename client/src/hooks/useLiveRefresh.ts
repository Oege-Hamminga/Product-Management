import { useEffect, useRef } from "react";
import { onDataChanged } from "../api/client";

// Re-runs `callback` whenever the backend notices someone else's change (see
// onDataChanged in localClient.ts / githubDb.ts's polling) — a no-op on
// builds with nothing to poll for (the real server, or plain IndexedDB).
// Pages pass their own load() function so a save made elsewhere shows up
// here without a manual reload.
export function useLiveRefresh(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => onDataChanged(() => callbackRef.current()), []);
}
