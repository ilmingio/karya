import { spawn } from "node:child_process";
import { KaryaError } from "@karya/shared-types";

export interface CommandResult {
  argv: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const OUTPUT_CAP = 8_000;

function clip(text: string): string {
  if (text.length <= OUTPUT_CAP) return text;
  return `${text.slice(0, OUTPUT_CAP)}\n…[truncated]`;
}

export function assertArgv(argv: string[]): void {
  if (argv.length === 0 || argv.some((part) => typeof part !== "string" || part.length === 0 || part.includes("\0"))) {
    throw new KaryaError("Command argv must be a non-empty list of strings.", "bad_args");
  }
}

export function isAllowlisted(argv: string[], allowlist: string[][]): boolean {
  return allowlist.some(
    (prefix) => prefix.length > 0 && prefix.length <= argv.length && prefix.every((part, index) => argv[index] === part),
  );
}

export async function runCommand(options: {
  root: string;
  argv: string[];
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CommandResult> {
  assertArgv(options.argv);
  const [command, ...args] = options.argv;
  if (!command) {
    throw new KaryaError("Command argv must be a non-empty list of strings.", "bad_args");
  }

  const env = { ...process.env };
  delete env.KARYA_API_KEY;

  return new Promise((resolve, reject) => {
    let settled = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.root,
      shell: false,
      env,
      signal: options.signal,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 200).unref();
    }, options.timeoutMs);

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        argv: options.argv,
        exitCode,
        stdout: clip(Buffer.concat(stdout).toString("utf8")),
        stderr: clip(Buffer.concat(stderr).toString("utf8")),
        timedOut,
      });
    };

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => finish(code));
  });
}
