import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Route handlers and libraries run outside Next here, so there is no data cache: cached
// functions run every time, and revalidations are recorded for tests to check (DIG-27).
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// `after()` runs work once the response is sent, and only works inside a request. Here the work is
// started at once and remembered, so a test can `await settleAfter()` (tests/api/helpers.ts) before
// it checks what the work did (DIG-107).
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: (() => unknown) | Promise<unknown>) => {
    const g = globalThis as { __afterTasks?: Promise<unknown>[] };
    (g.__afterTasks ??= []).push(Promise.resolve().then(() => (typeof task === "function" ? task() : task)));
  },
}));

afterEach(() => {
  cleanup();
});

// jsdom does not implement <dialog> modality. Provide the minimum the app uses.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
