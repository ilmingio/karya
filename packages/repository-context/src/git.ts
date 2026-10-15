import { spawn } from "node:child_process";

export interface GitStatus {
  available: boolean;
  branch: string | null;
  changedFiles: string[];
  porcelain: string;
}

function runGit(root: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: root, shell: false });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolve({ code: 127, stdout: "" }));
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

export async function readGitStatus(root: string): Promise<GitStatus> {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return { available: false, branch: null, changedFiles: [], porcelain: "" };
  }
  const branch = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await runGit(root, ["status", "--porcelain"]);
  const changedFiles = status.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((line) => line.length > 0);
  return {
    available: true,
    branch: branch.stdout.trim() || null,
    changedFiles,
    porcelain: status.stdout.trim(),
  };
}
