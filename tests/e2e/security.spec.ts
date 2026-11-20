import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { publicZinePath } from "../../src/lib/public-zine-path";
import { SECURITY_HEADERS } from "../../src/lib/security-headers";
import { createUserWithPhotos, defaultBoardId, deleteUser, makePro, signIn, testDb, uploadAndProcess } from "./helpers";

/**
 * DIG-104: security headers, the Content Security Policy, the Origin check, and security.txt.
 * The test server enforces the CSP (CSP_MODE=enforce in playwright.config.ts), so any page that
 * needs something the policy forbids fails here, not in production.
 */

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

/** Records every Content Security Policy violation the browser reports, on every page it loads. */
async function watchViolations(page: Page) {
  const seen: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || "inline"} on ${location.pathname}`);
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) seen.push(m.text());
  });
  return {
    /** Violations so far, from the console and from the page's own event listener. */
    async all() {
      const fromPage = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
      return [...seen, ...fromPage];
    },
  };
}

async function expectNoViolations(watch: Awaited<ReturnType<typeof watchViolations>>, where: string) {
  expect(await watch.all(), `CSP violations on ${where}`).toEqual([]);
}

test.describe("security headers", () => {
  for (const path of ["/", "/signin", "/terms", "/api/health"]) {
    test(`${path} carries every one`, async ({ request }) => {
      const res = await request.get(path);
      for (const { key, value } of SECURITY_HEADERS) {
        expect(res.headers()[key.toLowerCase()], `${key} on ${path}`).toBe(value);
      }
      expect(res.headers()["x-powered-by"], "X-Powered-By on " + path).toBeUndefined();
    });
  }

  test("an unknown page and an error response carry them too", async ({ request }) => {
    const res = await request.get(`/z/no-such-${randomUUID().slice(0, 6)}`);
    expect(res.status()).toBe(404);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
  });
});

test.describe("Content Security Policy", () => {
  test("is enforced, strict about scripts, and different on every request", async ({ request }) => {
    const a = await request.get("/signin");
    const b = await request.get("/signin");
    const csp = a.headers()["content-security-policy"];
    expect(csp, "enforcing header").toBeTruthy();
    expect(a.headers()["content-security-policy-report-only"]).toBeUndefined();
    const scripts = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const nonce = (h: string) => /'nonce-([^']+)'/.exec(h)![1];
    expect(nonce(csp)).not.toBe(nonce(b.headers()["content-security-policy"]));
  });

  test("the nonce in the header is the one on the page's own scripts", async ({ request }) => {
    const res = await request.get("/signin");
    const nonce = /'nonce-([^']+)'/.exec(res.headers()["content-security-policy"])![1];
    const html = await res.text();
    const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, "script tag without the nonce").toContain(`nonce="${nonce}"`);
  });

  test("visitor pages load and work with no violation", async ({ page }) => {
    const watch = await watchViolations(page);
    for (const path of ["/", "/signin", "/signup", "/terms", "/privacy", "/verify-email"]) {
      await page.goto(path);
      await expect(page.locator("main, h1").first()).toBeVisible();
      await expectNoViolations(watch, path);
    }
    // The pages' own scripts run: the sign-up form validates in the browser.
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /enter your name/i })).toBeVisible();
    await expectNoViolations(watch, "sign-up form");
  });

  test("Google sign-in starts, then leaves for Google, with no violation", async ({ page }) => {
    const watch = await watchViolations(page);
    let reached = false;
    await page.route("https://accounts.google.com/**", async (route) => {
      reached = true;
      await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google</h1>" });
    });
    await page.goto("/signin");
    await page.getByRole("button", { name: /continue with google/i }).click();
    await expect.poll(() => reached).toBe(true);
    await expectNoViolations(watch, "Google sign-in");
  });

  test("a creator's studio works end to end: board, upload, edit, zines, editor, recipes, billing", async ({ page }) => {
    const { user, assets } = await createUserWithPhotos();
    cleanup.push(user.id);
    await makePro(user.id);
    const watch = await watchViolations(page);
    await signIn(page, user.email, user.password);
    await expectNoViolations(watch, "the board");

    // Uploading sends the photo to storage and shows it, which needs connect-src, img-src, and blob URLs.
    await uploadAndProcess(page, user.id, "csp-upload.jpg");
    await expectNoViolations(watch, "an upload");

    // The photo editor draws crops and frames with inline styles.
    await page.getByRole("button", { name: "Edit persimmon.jpg" }).click();
    await expect(page.getByRole("dialog", { name: "Edit persimmon.jpg" })).toBeVisible();
    await page.getByRole("dialog").getByRole("radio", { name: "Polaroid" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expectNoViolations(watch, "the photo editor");

    // A zine, built and published through the editor.
    await page.goto("/editor");
    await page.getByLabel("Title").fill("CSP Walk");
    await page.getByRole("button", { name: "Create zine" }).click();
    await expect(page).toHaveURL(/\/editor\/[a-z0-9]+$/);
    await page.getByRole("button", { name: "Add cellar.jpg" }).click();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expectNoViolations(watch, "the editor");

    // The PDF download (Pro) makes a blob and saves it.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /export|download|pdf/i }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expectNoViolations(watch, "the PDF download");

    for (const path of ["/boards", "/recipes", "/billing", "/editor"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(watch, path);
    }
    expect(assets.length).toBeGreaterThan(0);
  });

  test("a public zine and its full-screen view work with no violation", async ({ page }) => {
    const { user, assets } = await createUserWithPhotos();
    cleanup.push(user.id);
    const slug = `csp-${randomUUID().slice(0, 6)}`;
    await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "CSP Public",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: {
          create: [
            { pageNumber: 1, content: { assetId: assets[0].id, caption: "One" }, flipEnabled: true },
            { pageNumber: 2, content: { assetId: assets[1].id, caption: "Two" }, flipEnabled: true },
          ],
        },
      },
    });
    const watch = await watchViolations(page);
    await page.goto(publicZinePath(user.publicId, slug));
    await expect(page.getByRole("heading", { level: 1, name: "CSP Public" })).toBeVisible();
    await page.getByRole("button", { name: /Page 1: flip/ }).click();
    await page.getByRole("button", { name: /Page 1: flip/ }).click();
    await expectNoViolations(watch, "flipping a card");

    await page.getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.keyboard.press("ArrowRight");
    await expectNoViolations(watch, "the full-screen view");
  });
});

test.describe("the Origin check", () => {
  const evil = { Origin: "https://evil.example" };

  test("refuses a cross-site POST, PATCH, PUT, and DELETE before they reach a route", async ({ request }) => {
    for (const method of ["post", "patch", "put", "delete"] as const) {
      const res = await request[method]("/api/zines", { headers: evil, data: {} });
      expect(res.status(), method).toBe(403);
      expect(await res.json()).toEqual({ error: "Cross-site request refused." });
    }
  });

  test("lets this site's own requests through to the route, which then asks them to sign in", async ({ request, baseURL }) => {
    const res = await request.post("/api/zines", { headers: { Origin: baseURL! }, data: { title: "x" } });
    expect(res.status()).toBe(401);
  });

  test("goes by Sec-Fetch-Site when there is no Origin", async ({ request }) => {
    expect((await request.post("/api/zines", { headers: { "Sec-Fetch-Site": "cross-site" }, data: {} })).status()).toBe(403);
    expect((await request.post("/api/zines", { headers: { "Sec-Fetch-Site": "same-origin" }, data: {} })).status()).toBe(401);
  });

  test("lets a non-browser client through, which has no cookie of the victim's to abuse", async ({ request }) => {
    expect((await request.post("/api/zines", { data: {} })).status()).toBe(401);
  });

  test("never blocks a read", async ({ request }) => {
    expect((await request.get("/api/health", { headers: evil })).status()).toBe(200);
  });

  test("does not apply to the signed Stripe webhook or the CSP report endpoint", async ({ request }) => {
    const webhook = await request.post("/api/billing/webhook", { headers: evil, data: "{}" });
    expect(webhook.status(), "webhook").not.toBe(403);
    const report = await request.post("/api/csp-report", { headers: { ...evil, "content-type": "application/csp-report" }, data: "{}" });
    expect(report.status(), "csp-report").toBe(204);
  });

  test("covers sign-in too, so a login CSRF is refused", async ({ request }) => {
    const res = await request.post("/api/auth/callback/credentials", { headers: evil, form: { email: "a@b.co", password: "x" } });
    expect(res.status()).toBe(403);
  });
});

test.describe("security.txt", () => {
  test("is served at the well-known address with a way to report privately", async ({ request }) => {
    const res = await request.get("/.well-known/security.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body).toContain("Contact: https://github.com/jnleyva816/Digital-Zine/security/advisories/new");
    expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
  });
});
