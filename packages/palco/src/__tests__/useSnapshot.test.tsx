import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSnapshot } from "../useSnapshot";
import { fixtureSnapshot } from "./fixtures";

class StubEventSource {
  static instances: StubEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    StubEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe("useSnapshot", () => {
  beforeEach(() => {
    StubEventSource.instances = [];
    vi.stubGlobal("EventSource", StubEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve(fixtureSnapshot),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the initial snapshot on mount", async () => {
    const { result } = renderHook(() => useSnapshot());

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    expect(result.current.snapshot?.lastEventId).toBe(fixtureSnapshot.lastEventId);
  });

  it("opens an EventSource against /events and toggles connected on open/error", async () => {
    const { result } = renderHook(() => useSnapshot());

    await waitFor(() => expect(StubEventSource.instances.length).toBe(1));
    const source = StubEventSource.instances[0];
    expect(source.url).toBe("/events");

    act(() => {
      source.onopen?.();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      source.onerror?.();
    });
    expect(result.current.connected).toBe(false);
  });

  it("replaces the snapshot with whatever the server pushes over the stream", async () => {
    const { result } = renderHook(() => useSnapshot());
    await waitFor(() => expect(StubEventSource.instances.length).toBe(1));
    const source = StubEventSource.instances[0];

    const pushed = { ...fixtureSnapshot, lastEventId: 99 };
    act(() => {
      source.onmessage?.({ data: JSON.stringify(pushed) } as MessageEvent<string>);
    });

    expect(result.current.snapshot?.lastEventId).toBe(99);
  });

  it("closes the EventSource on unmount", async () => {
    const { unmount } = renderHook(() => useSnapshot());
    await waitFor(() => expect(StubEventSource.instances.length).toBe(1));
    const source = StubEventSource.instances[0];

    unmount();

    expect(source.closed).toBe(true);
  });
});

describe("useSnapshot, fallback estático", () => {
  beforeEach(() => {
    StubEventSource.instances = [];
    vi.stubGlobal("EventSource", StubEventSource as unknown as typeof EventSource);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reads the baked snapshot and reports isStatic when there is no server", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.includes("/api/snapshot")
        ? Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error("no")) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(fixtureSnapshot) }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.isStatic).toBe(true));
    expect(result.current.snapshot).toEqual(fixtureSnapshot);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("snapshot.json"))).toBe(true);
  });

  it("stays non-static when the server answers", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(fixtureSnapshot) }),
    ) as unknown as typeof fetch);
    const { result } = renderHook(() => useSnapshot());
    await waitFor(() => expect(result.current.snapshot).toEqual(fixtureSnapshot));
    expect(result.current.isStatic).toBe(false);
  });
});
