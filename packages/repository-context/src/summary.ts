import path from "node:path";
import { listFiles } from "./files";
import { readGitStatus, type GitStatus } from "./git";

const MANIFESTS = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
]);

export interface RepositorySummary {
  root: string;
  topLevel: string[];
  fileCount: number;
  truncated: boolean;
  languages: Record<string, number>;
  manifests: string[];
  git: GitStatus;
}

export async function repositorySummary(root: string): Promise<RepositorySummary> {
  const listed = await listFiles(root, 200);
  const languages: Record<string, number> = {};
  const manifests: string[] = [];
  const top = new Set<string>();

  for (const file of listed.files) {
    const ext = path.extname(file) || "[none]";
    languages[ext] = (languages[ext] ?? 0) + 1;
    if (MANIFESTS.has(path.basename(file)) || MANIFESTS.has(file)) manifests.push(file);
    top.add(file.split("/")[0] ?? file);
  }

  return {
    root,
    topLevel: [...top].sort(),
    fileCount: listed.files.length,
    truncated: listed.truncated,
    languages,
    manifests,
    git: await readGitStatus(root),
  };
}
