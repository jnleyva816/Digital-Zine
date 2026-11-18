import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStorageKey, getStorageDriver, isS3Configured } from "./index";
import { LocalStorageDriver, writeLocalObject } from "./local";

describe("buildStorageKey", () => {
  it("scopes keys to the user and keeps a safe stem and image extension", () => {
    const key = buildStorageKey("user_1", "My Photo (Final).JPEG");
    expect(key).toMatch(/^users\/user_1\/\d+-[0-9a-f]{12}-my-photo-final\.jpeg$/);
  });

  it("falls back to .jpg and 'asset' for odd names", () => {
    expect(buildStorageKey("u", "!!!.exe")).toMatch(/^users\/u\/\d+-[0-9a-f]{12}-asset\.jpg$/);
  });
});

describe("driver selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses local storage unless all four S3 variables are set", () => {
    vi.stubEnv("AWS_S3_BUCKET", "b");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "k");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    expect(isS3Configured()).toBe(false);
    expect(getStorageDriver().name).toBe("local");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "s");
    expect(isS3Configured()).toBe(true);
    expect(getStorageDriver().name).toBe("s3");
  });
});

describe("LocalStorageDriver", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-storage-"));
    vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("prepares a PUT to the local upload route with an encoded key", async () => {
    const prepared = await new LocalStorageDriver().prepareUpload({
      storageKey: "users/u1/a b.jpg",
      contentType: "image/jpeg",
    });
    expect(prepared).toMatchObject({
      driver: "local",
      method: "PUT",
      uploadUrl: "/api/uploads/local/users/u1/a%20b.jpg",
      publicUrl: "/api/media/users/u1/a%20b.jpg",
      headers: { "Content-Type": "image/jpeg" },
    });
  });

  it("writes inside the storage directory", async () => {
    await writeLocalObject("users/u1/ok.jpg", Buffer.from("x"), "image/jpeg");
    await expect(fs.readFile(path.join(dir, "users/u1/ok.jpg"), "utf8")).resolves.toBe("x");
  });

  it("rejects keys that escape the storage directory", async () => {
    await expect(writeLocalObject("../escape.jpg", Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
    await expect(writeLocalObject("users/../../escape.jpg", Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
  });
});
