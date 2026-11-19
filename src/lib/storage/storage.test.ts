import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStorageKey, getStorageDriver, isS3Configured } from "./index";
import { S3Client } from "@aws-sdk/client-s3";
import { LocalStorageDriver, writeLocalObject } from "./local";
import { S3StorageDriver } from "./s3";

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

describe("stored object size and delete (DIG-32)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-storage-"));
    vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("local: reports the real byte size of a stored object, or null when it is missing", async () => {
    await writeLocalObject("users/u1/a.jpg", Buffer.alloc(1234), "image/jpeg");
    const driver = new LocalStorageDriver();
    await expect(driver.getObjectSize("users/u1/a.jpg")).resolves.toBe(1234);
    await expect(driver.getObjectSize("users/u1/missing.jpg")).resolves.toBeNull();
  });

  it("local: deletes an object and its metadata sidecar", async () => {
    await writeLocalObject("users/u1/a.jpg", Buffer.from("x"), "image/jpeg");
    const driver = new LocalStorageDriver();
    await driver.deleteObject("users/u1/a.jpg");
    await expect(driver.getObjectSize("users/u1/a.jpg")).resolves.toBeNull();
    await expect(fs.access(path.join(dir, "users/u1/a.jpg.meta.json"))).rejects.toThrow();
    // Deleting twice is not an error.
    await expect(driver.deleteObject("users/u1/a.jpg")).resolves.toBeUndefined();
  });
});

describe("S3StorageDriver (DIG-32)", () => {
  const driver = () =>
    new S3StorageDriver({ bucket: "b", region: "us-east-1", accessKeyId: "AKIDTEST", secretAccessKey: "secret" });

  it("signs Content-Type too, so an upload cannot be stored as HTML (DIG-43)", async () => {
    const prepared = await driver().prepareUpload({ storageKey: "users/u1/a.jpg", contentType: "image/jpeg", size: 5000 });
    const signed = (new URL(prepared.uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-length", "content-type"]));
    // The browser must send exactly the signed type.
    expect(prepared.headers["Content-Type"]).toBe("image/jpeg");
  });

  it("signs the exact Content-Length so S3 rejects a body of any other size", async () => {
    const prepared = await driver().prepareUpload({
      storageKey: "users/u1/a.jpg",
      contentType: "image/jpeg",
      size: 5000,
    });
    const signed = new URL(prepared.uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed.split(";")).toContain("content-length");
    expect(prepared.method).toBe("PUT");
    // Browsers set Content-Length themselves from the body; they refuse to let scripts set it.
    expect(Object.keys(prepared.headers).map((h) => h.toLowerCase())).not.toContain("content-length");
  });

  it("reads the stored size with HeadObject, and null when the object is missing", async () => {
    const d = driver();
    const send = vi.spyOn(S3Client.prototype, "send");
    send.mockResolvedValueOnce({ ContentLength: 4321 } as never);
    await expect(d.getObjectSize("users/u1/a.jpg")).resolves.toBe(4321);
    send.mockRejectedValueOnce(Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }));
    await expect(d.getObjectSize("users/u1/missing.jpg")).resolves.toBeNull();
  });

  it("deletes with DeleteObject on the configured bucket", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValueOnce({} as never);
    await driver().deleteObject("users/u1/a.jpg");
    const command = send.mock.calls[0]?.[0] as { constructor: { name: string }; input: unknown };
    expect(command.constructor.name).toBe("DeleteObjectCommand");
    expect(command.input).toEqual({ Bucket: "b", Key: "users/u1/a.jpg" });
  });
});

describe("server-side read and write (DIG-26)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-storage-"));
    vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("local: writes an object with its content type and reads it back", async () => {
    const driver = new LocalStorageDriver();
    await driver.putObject("users/u1/x/full.avif", Buffer.from("avif-bytes"), "image/avif");
    await expect(driver.getObject("users/u1/x/full.avif")).resolves.toEqual(Buffer.from("avif-bytes"));
    await expect(driver.getObject("users/u1/missing.jpg")).resolves.toBeNull();
  });

  it("s3: puts with the content type and a long cache lifetime, and reads with GetObject", async () => {
    const d = new S3StorageDriver({ bucket: "b", region: "us-east-1", accessKeyId: "AKIDTEST", secretAccessKey: "secret" });
    const send = vi.spyOn(S3Client.prototype, "send");
    send.mockResolvedValueOnce({} as never);
    await d.putObject("users/u1/x/w480.avif", Buffer.from("a"), "image/avif");
    const put = send.mock.calls[0]?.[0] as unknown as { constructor: { name: string }; input: Record<string, unknown> };
    expect(put.constructor.name).toBe("PutObjectCommand");
    expect(put.input).toMatchObject({
      Bucket: "b",
      Key: "users/u1/x/w480.avif",
      ContentType: "image/avif",
      CacheControl: "public, max-age=31536000, immutable",
    });

    send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } } as never);
    await expect(d.getObject("users/u1/x.jpg")).resolves.toEqual(Buffer.from([1, 2, 3]));
    send.mockRejectedValueOnce(Object.assign(new Error("NoSuchKey"), { $metadata: { httpStatusCode: 404 } }));
    await expect(d.getObject("users/u1/missing.jpg")).resolves.toBeNull();
  });
});
