import { describe, expect, it } from "vitest";
import { redact } from "./index";

describe("redact", () => {
  it("removes configured secrets and common key shapes", () => {
    const text = "key sk-testsecretvalue and custom super-secret-value";
    expect(redact(text, ["super-secret-value"])).toBe(
      "key [REDACTED] and custom [REDACTED]",
    );
  });

  it("leaves short strings untouched", () => {
    expect(redact("abc abc", ["abc"])).toBe("abc abc");
  });
});
