import { describe, expect, it } from "vitest";
import { buildReport } from "./index";

describe("buildReport", () => {
  it("marks a zero exit verified and a skipped plan check unverified", () => {
    const report = buildReport(
      {
        summary: "check",
        steps: ["run"],
        risk: "low",
        checks: [
          { name: "unit", argv: ["node", "test.js"] },
          { name: "lint", argv: ["pnpm", "lint"] },
        ],
      },
      [{ argv: ["node", "test.js"], exitCode: 0, excerpt: "ok" }],
    );
    expect(report.checks.map((check) => check.status)).toEqual(["verified", "unverified"]);
    expect(report.summary).toBe("1 verified, 0 failed, 1 unverified.");
  });

  it("does not treat a non-zero exit as verified", () => {
    const report = buildReport(undefined, [{ argv: ["node", "bad.js"], exitCode: 1, excerpt: "nope" }]);
    expect(report.checks[0]?.status).toBe("failed");
  });
});
