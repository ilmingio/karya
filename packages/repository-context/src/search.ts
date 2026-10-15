import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listFiles } from "./files";

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml",
  ".txt", ".css", ".html", ".toml",
]);

function parseRg(stdout: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line || hits.length >= limit) break;
    const match = /^(.+?):(\d+):(.*)$/.exec(line);
    if (!match) continue;
    hits.push({
      path: (match[1] ?? "").replace(/^\.\//, ""),
      line: Number(match[2]),
      text: match[3] ?? "",
    });
  }
  return hits;
}

async function searchWithRg(root: string, query: string, limit: number): Promise<SearchHit[] | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "rg",
      [
        "--line-number",
        "--no-heading",
        "--color",
        "never",
        "--max-count",
        "5",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!dist/**",
        "--glob",
        "!coverage/**",
        "-m",
        String(limit),
        "--",
        query,
        ".",
      ],
      { cwd: root, shell: false },
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0 && code !== 1) {
        resolve(null);
        return;
      }
      resolve(parseRg(Buffer.concat(chunks).toString("utf8"), limit));
    });
  });
}

async function searchByScan(root: string, query: string, limit: number): Promise<SearchHit[]> {
  const { files } = await listFiles(root, 500);
  const hits: SearchHit[] = [];
  const needle = query.toLowerCase();
  for (const file of files) {
    if (hits.length >= limit) break;
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    let text: string;
    try {
      text = await readFile(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (hits.length >= limit) break;
      const line = lines[index] ?? "";
      if (line.toLowerCase().includes(needle)) {
        hits.push({ path: file, line: index + 1, text: line.slice(0, 400) });
      }
    }
  }
  return hits;
}

export async function searchText(root: string, query: string, limit = 30): Promise<SearchHit[]> {
  const bounded = Math.max(1, Math.min(limit, 50));
  const rg = await searchWithRg(root, query, bounded);
  if (rg) return rg;
  return searchByScan(root, query, bounded);
}
