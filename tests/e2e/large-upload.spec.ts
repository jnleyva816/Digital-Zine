import { expect, test } from "@playwright/test";
import { createUser, deleteUser, signIn, testDb, wideJpeg } from "./helpers";

/**
 * A valid JPEG padded to at least `size` bytes with application segments ahead of the image data,
 * so a cut-off copy has no image in it at all.
 */
async function paddedJpeg(size: number) {
  const jpeg = await wideJpeg(1200, 800);
  const payload = 65_533;
  const segment = Buffer.alloc(payload + 4);
  segment.writeUInt16BE(0xffef, 0); // APP15, which decoders skip
  segment.writeUInt16BE(payload + 2, 2);
  const segments = Array.from({ length: Math.ceil(size / segment.length) }, () => segment);
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

test("a photo over 10 MB uploads whole and is processed (DIG-120)", async ({ page }) => {
  const user = await createUser();
  try {
    await signIn(page, user.email, user.password);
    const buffer = await paddedJpeg(12 * 1024 * 1024);
    const name = "large.jpg";

    const put = page.waitForResponse((r) => r.url().includes("/api/uploads/local/") && r.request().method() === "PUT");
    await page.getByLabel("choose files").setInputFiles({ name, mimeType: "image/jpeg", buffer });
    const response = await put;
    expect(response.status()).toBe(200);
    // The upload route still goes through the middleware (DIG-104).
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");

    const status = async () =>
      (await testDb.mediaAsset.findFirst({ where: { ownerId: user.id, originalName: name } }))?.status;
    await expect.poll(status, { timeout: 20_000 }).toMatch(/^(ready|failed)$/);
    expect(await status()).toBe("ready");
  } finally {
    await deleteUser(user.id);
  }
});
