// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { useBoardReorder } from "./useBoardReorder";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const onAnnounce = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => {
    const [assets, setAssets] = useState([boardAsset("a"), boardAsset("b"), boardAsset("c")]);
    return { assets, reorder: useBoardReorder({ assets, setAssets, onAnnounce, onError }) };
  });
  const order = () => hook.result.current.assets.map((a) => a.id);
  return { ...hook, onAnnounce, onError, order };
}

describe("useBoardReorder (DIG-47)", () => {
  it("moves a photo, saves the new order, and announces it", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const { result, onAnnounce, order } = setup();
    act(() => result.current.reorder.moveBy(0, 1));
    expect(order()).toEqual(["b", "a", "c"]);
    await waitFor(() => expect(onAnnounce).toHaveBeenCalledWith("a.jpg moved to position 2 of 3."));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ orderedIds: ["b", "a", "c"] });
  });

  it("puts the order back and reports the error when the save fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Could not save the new order." }, 500));
    const { result, onError, onAnnounce, order } = setup();
    act(() => result.current.reorder.moveBy(2, -1));
    expect(order()).toEqual(["a", "c", "b"]);
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("Could not save the new order."));
    expect(order()).toEqual(["a", "b", "c"]);
    expect(onAnnounce).not.toHaveBeenCalled();
  });

  it("does nothing past either end of the board", () => {
    const { result, order } = setup();
    act(() => result.current.reorder.moveBy(0, -1));
    act(() => result.current.reorder.moveBy(2, 1));
    expect(order()).toEqual(["a", "b", "c"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a dragged photo into the gap it was held over", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const { result, order } = setup();
    act(() => result.current.reorder.setDrag("a"));
    expect(result.current.reorder.isDragging()).toBe(true);
    act(() => result.current.reorder.setDrop(3));
    act(() => result.current.reorder.handleDrop());
    expect(order()).toEqual(["b", "c", "a"]);
    expect(result.current.reorder.isDragging()).toBe(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
});
