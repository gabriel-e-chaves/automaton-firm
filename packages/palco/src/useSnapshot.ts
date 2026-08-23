import { useEffect, useState } from "react";
import type { PalcoSnapshot } from "./types";

export interface UseSnapshotResult {
  snapshot: PalcoSnapshot | null;
  connected: boolean;
  /** True when the page is served from a static host and read the baked snapshot. */
  isStatic: boolean;
}

/**
 * Owns the realtime connection to the Palco server: an initial
 * `/api/snapshot` fetch (so the page has data before the stream opens),
 * then an `EventSource("/events")` that replaces the whole snapshot on
 * every `message` (the server pushes full snapshots, not diffs — see
 * the design spec §2). `connected` reflects the EventSource's open/error
 * state; the browser's EventSource auto-reconnects on its own, so no
 * manual retry logic is needed here.
 */
export function useSnapshot(): UseSnapshotResult {
  const [snapshot, setSnapshot] = useState<PalcoSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [isStatic, setIsStatic] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/snapshot")
      .then((res) => {
        // Only an EXPLICIT ok:false is a failure. A response object without the
        // field (older mocks, non-fetch shims) must still count as success —
        // treating undefined as failure would send a working server down the
        // static-fallback path.
        if (res.ok === false) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: PalcoSnapshot) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        // No server (e.g. a static host like GitHub Pages). Fall back to the
        // snapshot baked into the build. `isStatic` then tells the header to
        // say "replay estático" instead of "reconectando…" — there is nothing
        // to reconnect TO, and a badge implying a live feed on a frozen page
        // would be the one dishonest pixel on the site.
        fetch(`${import.meta.env.BASE_URL}snapshot.json`)
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error("no static snapshot"))))
          .then((data: PalcoSnapshot) => {
            if (cancelled) return;
            setSnapshot(data);
            setIsStatic(true);
          })
          .catch(() => {
            // Neither source available: the empty state is the honest render.
          });
      });

    const source = new EventSource("/events");

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event: MessageEvent<string>) => {
      try {
        setSnapshot(JSON.parse(event.data) as PalcoSnapshot);
      } catch {
        // Ignore malformed frames (e.g. heartbeat comments never reach
        // onmessage, but stay defensive against bad payloads).
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  return { snapshot, connected, isStatic };
}
