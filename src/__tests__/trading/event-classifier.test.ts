import { describe, it, expect } from "vitest";
import { classifyAnnouncement } from "../../trading/event-classifier.js";
import type { WorkerInferenceClient } from "../../agent/harness-types.js";
import type { Announcement } from "../../trading/announcement-feed.js";

function scripted(content: string): WorkerInferenceClient {
  return { chat: async () => ({ content }) } as unknown as WorkerInferenceClient;
}

const ann = (title: string, body: string | null = null): Announcement => ({
  code: "c1", catalogId: 161, title, body, releaseDate: 1787000000000,
});

describe("event-classifier", () => {
  it("reads a multi-symbol spot delisting out of prose", async () => {
    const inference = scripted(JSON.stringify({
      kind: "spot_delist", symbols: ["ICX", "SCRT", "STORJ"],
      effectiveTime: "2026-09-03T00:00:00Z", confidence: 0.95,
    }));
    const { event, ok } = await classifyAnnouncement({
      inference, model: "test", announcement: ann("Binance Will Delist ICX, SCRT, STORJ on 2026-09-03"),
    });
    expect(ok).toBe(true);
    expect(event.kind).toBe("spot_delist");
    expect(event.symbols).toEqual(["ICX", "SCRT", "STORJ"]);
    expect(event.effectiveTime).toBe(Date.parse("2026-09-03T00:00:00Z"));
  });

  it("keeps margin-only removals out of the delisting set", async () => {
    const inference = scripted(JSON.stringify({
      kind: "margin_only", symbols: ["BTTC", "POWR"],
      effectiveTime: "2026-08-14T00:00:00Z", confidence: 0.9,
    }));
    const { event } = await classifyAnnouncement({
      inference, model: "test",
      announcement: ann("Binance Margin And Loan Will Delist BTTC & POWR on 2026-08-14"),
    });
    expect(event.kind).toBe("margin_only");
  });

  it("tolerates a fenced JSON response", async () => {
    const inference = scripted('```json\n{"kind":"pair_removal","symbols":["AEUR"],"effectiveTime":"2026-08-21T00:00:00Z","confidence":0.7}\n```');
    const { event, ok } = await classifyAnnouncement({
      inference, model: "test", announcement: ann("Notice of Removal of Spot Trading Pairs - 2026-08-21", "AEUR/BTC will be removed"),
    });
    expect(ok).toBe(true);
    expect(event.kind).toBe("pair_removal");
  });

  it("falls back to a typed 'other' event instead of throwing on garbage", async () => {
    const { event, ok } = await classifyAnnouncement({
      inference: scripted("I could not determine the answer."),
      model: "test", announcement: ann("Notice Regarding the Removal of AEUR"),
    });
    expect(ok).toBe(false);
    expect(event).toEqual({
      code: "c1", kind: "other", symbols: [], effectiveTime: 0, confidence: 0, model: "test",
    });
  });

  it("rejects an unknown kind rather than passing it through", async () => {
    const inference = scripted(JSON.stringify({
      kind: "definitely_delisted", symbols: ["X"], effectiveTime: "2026-01-01T00:00:00Z", confidence: 1,
    }));
    const { ok, event } = await classifyAnnouncement({ inference, model: "test", announcement: ann("t") });
    expect(ok).toBe(false);
    expect(event.kind).toBe("other");
  });

  it("uppercases symbols the model returned in lower case", async () => {
    const inference = scripted(JSON.stringify({
      kind: "spot_delist", symbols: ["icx", "sCrT"],
      effectiveTime: "2026-09-03T00:00:00Z", confidence: 0.9,
    }));
    const { event, ok } = await classifyAnnouncement({
      inference, model: "test", announcement: ann("Binance Will Delist icx, sCrT on 2026-09-03"),
    });
    expect(ok).toBe(true);
    expect(event.symbols).toEqual(["ICX", "SCRT"]);
  });

  it("falls back when effectiveTime is not a parseable date", async () => {
    const inference = scripted(JSON.stringify({
      kind: "spot_delist", symbols: ["ICX"],
      effectiveTime: "sometime next quarter", confidence: 0.9,
    }));
    const { event, ok } = await classifyAnnouncement({ inference, model: "test", announcement: ann("t") });
    expect(ok).toBe(false);
    expect(event).toEqual({
      code: "c1", kind: "other", symbols: [], effectiveTime: 0, confidence: 0, model: "test",
    });
  });
});
