// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "./board-test-utils";
import { useBoardPaging } from "./useBoardPaging";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function setup(initialCursor: string | null, loaded = ["a"]) {
  const onPage = vi.fn();
  const hook = renderHook(() =>
    useBoardPaging({ boardId: "board-1", initialCursor, initialTotal: 3, loadedIds: () => new Set(loaded), onPage })
  );
  return { ...hook, onPage };
}

const raw = (id: string) => ({ id, publicUrl: `/api/media/${id}.jpg`, kind: "photo" });

describe("useBoardPaging (DIG-47)", () => {
  it("does nothing when the whole board is loaded", async () => {
    const { result } = setup(null);
    await act(() => result.current.loadMore());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.loadingMore).toBe(false);
  });

  it("loads the next page, leaving out photos already on screen", async () => {
    let finish!: (res: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (finish = r)));
    const { result, onPage } = setup("cursor-1");
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadMore();
    });
    expect(result.current.loadingMore).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assets?boardId=board-1&limit=60&cursor=cursor-1");
    await act(async () => {
      finish(json({ assets: [raw("a"), raw("b"), raw("c")], nextCursor: null, total: 4 }));
      await pending;
    });
    expect(onPage).toHaveBeenCalledWith([expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "c" })]);
    expect(result.current).toEqual(expect.objectContaining({ loadingMore: false, cursor: null, total: 4, loadMoreError: null }));
  });

  it("reports a failed page and keeps its place, so it can try again", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Too many requests. Try again in a minute." }, 429));
    const { result, onPage } = setup("cursor-1");
    await act(() => result.current.loadMore());
    expect(result.current.loadMoreError).toBe("Too many requests. Try again in a minute.");
    expect(result.current.cursor).toBe("cursor-1");
    expect(result.current.loadingMore).toBe(false);
    expect(onPage).not.toHaveBeenCalled();
  });
});
