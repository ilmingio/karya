#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsxPackage = path.dirname(require.resolve("tsx/package.json"));
const tsx = path.join(tsxPackage, "dist", "cli.mjs");
const main = path.join(here, "..", "src", "main.ts");

const child = spawn(process.execPath, [tsx, main, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
