// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_STORAGE_BYTES } from "@/lib/billing/limits";
import { json } from "./board-test-utils";
import { useUploadQueue } from "./useUploadQueue";

vi.mock("@/lib/fuji/exif-client", () => ({
  extractExifFromFile: vi.fn().mockResolvedValue({ exif: { iso: 200 }, foundRecipe: null }),
}));

const jpeg = (name = "fog.jpg") => new File(["jpeg bytes"], name, { type: "image/jpeg" });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function setup(usedBytes = 0) {
  const onUploaded = vi.fn();
  const onFinished = vi.fn();
  const hook = renderHook(() => useUploadQueue({ boardId: "board-1", usedBytes, onUploaded, onFinished }));
  return { ...hook, onUploaded, onFinished };
}

describe("useUploadQueue (DIG-47)", () => {
  it("starts empty and idle", () => {
    const { result } = setup();
    expect(result.current.uploads).toEqual([]);
    expect(result.current.isUploading).toBe(false);
  });

  it("refuses a file that is not a JPEG without uploading it", () => {
    const { result } = setup();
    act(() => result.current.enqueue([new File(["x"], "scan.png", { type: "image/png" })]));
    expect(result.current.uploads).toEqual([
      expect.objectContaining({ name: "scan.png", stage: "error", error: "Only JPEG photos can be uploaded." }),
    ]);
    expect(result.current.isUploading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file that would go over the storage quota without uploading it", () => {
    const { result } = setup(ACCOUNT_STORAGE_BYTES);
    act(() => result.current.enqueue([jpeg()]));
    expect(result.current.uploads[0]).toEqual(expect.objectContaining({ stage: "error", error: expect.stringMatching(/storage is full/) }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads a photo onto the board and announces it", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ storageKey: "users/u/k.jpg", uploadUrl: "/api/uploads/local/users/u/k.jpg", method: "PUT", headers: { "Content-Type": "image/jpeg" } }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ asset: { id: "new", publicUrl: "/api/media/users/u/k.jpg", kind: "photo", status: "processing" } }, 201));
    const { result, onUploaded, onFinished } = setup();
    act(() => result.current.enqueue([jpeg()]));
    expect(result.current.isUploading).toBe(true);
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("1 photo added to the board."));
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: "new", status: "processing" }), null);
    expect(result.current.uploads).toEqual([]);
    const saved = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(saved).toEqual(expect.objectContaining({ storageKey: "users/u/k.jpg", boardId: "board-1", exif: { iso: 200 } }));
  });

  it("keeps a file that failed to upload in the list with the server's error, and adds nothing", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "This file is larger than the 75 MB limit." }, 413));
    const { result, onUploaded, onFinished } = setup();
    act(() => result.current.enqueue([jpeg()]));
    await waitFor(() => expect(result.current.uploads[0]?.stage).toBe("error"));
    expect(result.current.uploads[0].error).toBe("This file is larger than the 75 MB limit.");
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    act(() => result.current.dismiss(result.current.uploads[0].id));
    expect(result.current.uploads).toEqual([]);
  });
});
