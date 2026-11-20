// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import type { BoardAsset } from "./types";
import { PROCESSING_POLL_MS, useProcessingPoll } from "./useProcessingPoll";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(initial: BoardAsset[]) {
  return renderHook(() => {
    const [assets, setAssets] = useState(initial);
    useProcessingPoll("board-1", assets, setAssets);
    return assets;
  });
}

const tick = () => act(() => vi.advanceTimersByTimeAsync(PROCESSING_POLL_MS));

describe("useProcessingPoll (DIG-47)", () => {
  it("does not poll when no photo is processing", async () => {
    setup([boardAsset("a")]);
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swaps in a processed photo, asking only about the ones still processing", async () => {
    fetchMock.mockResolvedValue(
      json({ assets: [{ id: "b", publicUrl: "/api/media/b/full.avif", kind: "photo", status: "ready", sizeBytes: 900 }] })
    );
    const { result } = setup([boardAsset("a", { name: "kept" }), boardAsset("b", { status: "processing", name: "mine" })]);
    await tick();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assets?ids=b");
    expect(result.current[1]).toEqual(expect.objectContaining({ status: "ready", publicUrl: "/api/media/b/full.avif", sizeBytes: 900, name: "mine" }));
    expect(result.current[0].name).toBe("kept");
    // Nothing is processing now, so polling stops.
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves a photo untouched while the server still says it is processing", async () => {
    fetchMock.mockResolvedValue(json({ assets: [{ id: "b", publicUrl: "/server/b.jpg", kind: "photo", status: "processing", sizeBytes: 5 }] }));
    const before = boardAsset("b", { status: "processing", sizeBytes: 1234 });
    const { result } = setup([before]);
    await tick();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current[0]).toBe(before);
  });

  it("keeps waiting through a failed check", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(
      json({ assets: [{ id: "b", publicUrl: "/x", kind: "photo", status: "failed", processingError: "Bad file." }] })
    );
    const { result } = setup([boardAsset("b", { status: "processing" })]);
    await tick();
    expect(result.current[0].status).toBe("processing");
    await tick();
    expect(result.current[0]).toEqual(expect.objectContaining({ status: "failed", processingError: "Bad file." }));
  });
});
