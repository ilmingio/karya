import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { main } from "./main";

describe("cli", () => {
  it("prints help", async () => {
    const lines: string[] = [];
    const code = await main(["--help"], {
      stdout: (text) => lines.push(text),
      stderr: (text) => lines.push(text),
    });
    expect(code).toBe(0);
    expect(lines.join("")).toContain("karya ask");
    const forwarded = await main(["--", "--help"], {
      stdout: (text) => lines.push(text),
      stderr: (text) => lines.push(text),
    });
    expect(forwarded).toBe(0);
  });

  it("refuses to run without an API key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-cli-"));
    const errors: string[] = [];
    const code = await main(["ask", "--root", root, "What is this?"], {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
      env: {},
    });
    expect(code).toBe(1);
    expect(errors.join("")).toContain("KARYA_API_KEY");
  });

  it("refuses a config file that contains an API key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "karya-config-"));
    await mkdir(path.join(root, ".karya"));
    await writeFile(path.join(root, ".karya", "config.json"), JSON.stringify({ apiKey: "sk-testsecretvalue", model: "m" }));
    await expect(loadConfig(root, {})).rejects.toThrow(/Refusing to read secrets/);
    await expect(readFile(path.join(root, ".karya", "config.json"), "utf8")).resolves.toContain("sk-testsecretvalue");
  });
});
