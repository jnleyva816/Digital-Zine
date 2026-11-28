import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STORAGE_BYTES,
  MAX_UPLOAD_BYTES,
  boardLimitFor,
  boardLimitMessage,
  checkUpload,
  formatBytes,
  zineLimitFor,
} from "./limits";

describe("limits (DIG-32)", () => {
  it("caps one upload at 75 MB and a whole account, across all its boards, at 2 GB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(75 * 1024 * 1024);
    expect(ACCOUNT_STORAGE_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it("gives Free one zine and Pro unlimited zines", () => {
    expect(zineLimitFor("free")).toBe(1);
    expect(zineLimitFor("pro")).toBeNull();
  });

  it("gives Free one board and Pro unlimited boards (DIG-25)", () => {
    expect(boardLimitFor("free")).toBe(1);
    expect(boardLimitFor("pro")).toBeNull();
    expect(boardLimitMessage(1)).toBe("Free includes 1 board. Upgrade to Pro for unlimited boards.");
  });
});

describe("checkUpload", () => {
  it("allows a file that fits under both limits", () => {
    expect(checkUpload({ size: 10, usedBytes: 0 })).toEqual({ ok: true });
  });

  it("allows a file of exactly 75 MB that exactly fills the board", () => {
    expect(checkUpload({ size: MAX_UPLOAD_BYTES, usedBytes: ACCOUNT_STORAGE_BYTES - MAX_UPLOAD_BYTES })).toEqual({
      ok: true,
    });
  });

  it("rejects an empty or non-integer size", () => {
    expect(checkUpload({ size: 0, usedBytes: 0 })).toMatchObject({ ok: false, reason: "invalid_size" });
    expect(checkUpload({ size: 1.5, usedBytes: 0 })).toMatchObject({ ok: false, reason: "invalid_size" });
  });

  it("rejects a file over 75 MB with a message that names the limit", () => {
    expect(checkUpload({ size: MAX_UPLOAD_BYTES + 1, usedBytes: 0 })).toEqual({
      ok: false,
      reason: "too_large",
      message: "This file is larger than the 75 MB limit.",
    });
  });

  it("rejects a file that would push the account past 2 GB and says how much room is left", () => {
    expect(checkUpload({ size: 2 * 1024 * 1024, usedBytes: ACCOUNT_STORAGE_BYTES - 1024 * 1024 })).toEqual({
      ok: false,
      reason: "over_quota",
      message: "Your storage is full: 1 MB of 2 GB left. Delete photos to make room.",
    });
  });
});

describe("formatBytes", () => {
  it("formats bytes for people", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(512 * 1024)).toBe("0.5 MB");
    expect(formatBytes(75 * 1024 * 1024)).toBe("75 MB");
    expect(formatBytes(1536 * 1024 * 1024)).toBe("1.5 GB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2 GB");
  });
});
