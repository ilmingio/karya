import { readFile } from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";

const ALWAYS_IGNORED = [
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".karya/sessions",
];

export async function loadIgnore(root: string): Promise<Ignore> {
  const rules = ignore();
  rules.add(ALWAYS_IGNORED);
  try {
    const text = await readFile(path.join(root, ".gitignore"), "utf8");
    rules.add(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return rules;
}

export function isIgnored(rules: Ignore, relativePath: string, isDirectory: boolean): boolean {
  if (!relativePath || relativePath === ".") return false;
  const normalized = relativePath.split(path.sep).join("/");
  return rules.ignores(isDirectory ? `${normalized}/` : normalized);
}
