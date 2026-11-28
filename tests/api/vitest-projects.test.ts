import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../vitest.config.mjs";

// DIG-123: unit and component tests never touch the database, so they must not wait for its reset
// or run one file at a time. Only the API tests share the test database.
type Project = {
  test: { name: string; include: string[]; globalSetup?: string[]; fileParallelism?: boolean };
};
const projects = (config.test?.projects ?? []) as Project[];
const project = (name: string) => projects.find((p) => p.test.name === name)?.test;

describe("Vitest projects", () => {
  it("runs unit and component tests in parallel, with no database setup", () => {
    const fast = project("fast");
    expect(fast?.include).toEqual(["src/**/*.test.{ts,tsx}"]);
    expect(fast?.globalSetup).toBeUndefined();
    expect(fast?.fileParallelism).not.toBe(false);
  });

  it("resets the test database for API tests and runs their files one at a time", () => {
    const api = project("api");
    expect(api?.include).toEqual(["tests/api/**/*.test.ts"]);
    expect(api?.globalSetup).toEqual(["tests/setup/vitest.global-setup.ts"]);
    expect(api?.fileParallelism).toBe(false);
  });

  it("has no top-level database setup that would apply to every project", () => {
    expect(config.test?.globalSetup).toBeUndefined();
    expect(config.test?.fileParallelism).toBeUndefined();
  });

  it("keeps every suite in CI: npm test runs both projects, then the e2e suite", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts["test:fast"]).toBe("vitest run --project fast");
    expect(pkg.scripts["test:api"]).toBe("vitest run --project api");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("run: npm test\n");
    expect(ci).toContain("run: npm run test:e2e");
  });
});
