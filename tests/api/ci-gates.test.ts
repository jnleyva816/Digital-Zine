import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// DIG-103: the security gates must stay in place. They are config files, so a quiet deletion or a
// weakened audit level would otherwise go unnoticed until the next vulnerability slips through.
const read = (path: string) => readFileSync(path, "utf8");

describe("dependency audit in CI", () => {
  const ci = read(".github/workflows/ci.yml");

  it("fails the build on a high-severity advisory in production dependencies", () => {
    expect(ci).toContain("npm audit --omit=dev --audit-level=high");
  });

  it("runs the audit as its own job, so it reports even when the build fails and never waits on the database", () => {
    const audit = ci.indexOf("npm audit");
    const database = ci.indexOf("postgres:17");
    expect(audit).toBeGreaterThan(-1);
    // The audit job sits before the test job that owns the Postgres service.
    expect(audit).toBeLessThan(database);
  });

  it("checks again on a schedule, since new advisories appear without any code changing", () => {
    expect(ci).toMatch(/schedule:\s*\n\s*- cron:/);
  });
});

describe("Dependabot", () => {
  it("updates npm and GitHub Actions weekly", () => {
    expect(existsSync(".github/dependabot.yml")).toBe(true);
    const config = read(".github/dependabot.yml");
    for (const ecosystem of ["npm", "github-actions"]) {
      expect(config).toMatch(new RegExp(`package-ecosystem: "?${ecosystem}"?`));
    }
    expect(config.match(/interval: "?weekly"?/g)?.length).toBeGreaterThanOrEqual(2);
  });

  // DIG-124: these majors are deferred, so a pull request for one can only fail. Limiting the rule to
  // semver-major version updates keeps minor, patch, and security updates coming.
  it.each(["@prisma/client", "@types/node", "eslint", "eslint-config-next", "next", "prisma", "typescript"])(
    "ignores only major updates of %s",
    (name) => {
      const config = read(".github/dependabot.yml");
      expect(config).toContain(
        `      - dependency-name: "${name}"\n        update-types: ["version-update:semver-major"]\n`,
      );
    },
  );
});

describe("CodeQL", () => {
  it("scans JavaScript and TypeScript on pull requests, on main, and weekly", () => {
    expect(existsSync(".github/workflows/codeql.yml")).toBe(true);
    const codeql = read(".github/workflows/codeql.yml");
    expect(codeql).toContain("github/codeql-action/init");
    expect(codeql).toContain("github/codeql-action/analyze");
    expect(codeql).toMatch(/languages:\s*javascript-typescript/);
    expect(codeql).toContain("pull_request");
    expect(codeql).toMatch(/branches:\s*\[main\]/);
    expect(codeql).toMatch(/schedule:\s*\n\s*- cron:/);
    // It may write findings to the Security tab and nothing else.
    expect(codeql).toMatch(/security-events:\s*write/);
  });
});
