import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { stdin as input, stdout as output } from "node:process";
import { runAgent } from "@karya/agent-runtime";
import { OpenAICompatibleProvider } from "@karya/provider-adapters";
import { resolveWorkspace } from "@karya/repository-context";
import { SessionStore } from "@karya/session-store";
import { KaryaError, redact, type ApprovalRequest } from "@karya/shared-types";
import { formatReport } from "@karya/verification";
import { loadConfig } from "./config";

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  isTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}

const HELP = `Karya — repository-aware coding agent

Usage:
  karya ask [--root <dir>] <question>
  karya run [--root <dir>] <task>
  karya --help

Environment:
  KARYA_API_KEY     API key. Required for ask and run. Never put this in the project.
  KARYA_BASE_URL    OpenAI-compatible base URL (default https://api.openai.com/v1)
  KARYA_MODEL       Model name (default gpt-4o-mini)

Optional .karya/config.json may set baseUrl, model, budget, and commandAllowlist.
`;

const defaultIo: Io = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  isTTY: Boolean(process.stdin.isTTY),
};

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  try {
    return await runCli(args, io);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Karya failed.";
    io.stderr(`${redact(message, [])}\n`);
    return 1;
  }
}

async function runCli(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: { type: "boolean", short: "h", default: false },
      root: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  const command = positionals[0];
  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (!command) {
    io.stdout(HELP);
    return 1;
  }
  if (command !== "ask" && command !== "run") {
    throw new KaryaError(`Unknown command ${command}.`, "bad_command");
  }

  const task = positionals.slice(1).join(" ").trim();
  if (!task) throw new KaryaError(`Pass a ${command === "ask" ? "question" : "task"} after ${command}.`, "bad_command");

  const workspaceRoot = await resolveWorkspace(values.root ?? process.cwd());
  const config = await loadConfig(workspaceRoot, io.env ?? process.env);
  if (!config.apiKey) {
    throw new KaryaError("Set KARYA_API_KEY to use a model provider.", "missing_key");
  }

  const session = await SessionStore.create({ workspaceRoot, secrets: [config.apiKey] });
  const provider = new OpenAICompatibleProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });

  io.stdout(`Session ${session.id}\n`);
  const result = await runAgent({
    task,
    mode: command,
    config,
    provider,
    session,
    approve: (request) => approve(request, io),
    onEvent: (event) => {
      if (event.type === "tool_result" && typeof event.data.name === "string") {
        io.stdout(`→ ${event.data.name}\n`);
      }
    },
  });

  io.stdout(`\nModel\n${result.message}\n\n${formatReport(result.report)}\n`);
  if (result.status !== "completed") return 1;
  if (result.report.checks.some((check) => check.status !== "verified")) return 2;
  return 0;
}

async function approve(request: ApprovalRequest, io: Io): Promise<boolean> {
  io.stdout(`\nApproval required (${request.kind}): ${request.summary}\n${request.detail}\n`);
  if (io.approve) return io.approve(request);
  if (!(io.isTTY ?? process.stdin.isTTY)) {
    io.stderr("Refusing this action because there is no interactive terminal.\n");
    return false;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("Approve? [y/N] ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
