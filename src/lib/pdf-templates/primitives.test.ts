import * as renderer from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import * as primitives from "./primitives";

// DIG-71: the templates draw with these so the browser preview does not load react-pdf.
describe("template primitives", () => {
  it("are the ones react-pdf renders", () => {
    expect(Object.keys(primitives).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(primitives)) expect(value).toBe(renderer[name as keyof typeof renderer]);
  });
});
