import { describe, expect, it } from "vitest";
import { mapLimit } from "./concurrency";

describe("mapLimit (DIG-41)", () => {
  it("never runs more than the limit at once, and keeps the results in order", async () => {
    let running = 0;
    let most = 0;
    const results = await mapLimit([30, 5, 20, 1, 15, 10], 2, async (ms, i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return `page ${i + 1}`;
    });
    expect(most).toBe(2);
    expect(results).toEqual(["page 1", "page 2", "page 3", "page 4", "page 5", "page 6"]);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 2, async () => 1)).toEqual([]);
  });
});
