import type { ExecutedCommand, Plan, VerificationCheck, VerificationReport } from "@karya/shared-types";

function sameArgv(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function statusFor(exitCode: number | null): "verified" | "failed" {
  return exitCode === 0 ? "verified" : "failed";
}

export function buildReport(plan: Plan | undefined, commands: ExecutedCommand[]): VerificationReport {
  const checks: VerificationCheck[] = [];
  const consumed = new Set<number>();

  for (const planned of plan?.checks ?? []) {
    const index = commands.findIndex((command, commandIndex) => !consumed.has(commandIndex) && sameArgv(command.argv, planned.argv));
    if (index === -1) {
      checks.push({ name: planned.name, argv: planned.argv, status: "unverified" });
      continue;
    }
    consumed.add(index);
    const command = commands[index];
    if (!command) continue;
    checks.push({
      name: planned.name,
      argv: command.argv,
      status: statusFor(command.exitCode),
      exitCode: command.exitCode ?? undefined,
      outputExcerpt: command.excerpt,
    });
  }

  commands.forEach((command, index) => {
    if (consumed.has(index)) return;
    checks.push({
      name: command.argv.join(" "),
      argv: command.argv,
      status: statusFor(command.exitCode),
      exitCode: command.exitCode ?? undefined,
      outputExcerpt: command.excerpt,
    });
  });

  if (checks.length === 0) {
    return { checks, summary: "No checks were executed. Nothing was verified." };
  }

  const verified = checks.filter((check) => check.status === "verified").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  const unverified = checks.filter((check) => check.status === "unverified").length;
  return {
    checks,
    summary: `${verified} verified, ${failed} failed, ${unverified} unverified.`,
  };
}

export function formatReport(report: VerificationReport): string {
  const lines = ["Evidence", report.summary];
  for (const check of report.checks) {
    const exit = check.exitCode === undefined ? "not run" : `exit ${check.exitCode}`;
    lines.push(`- [${check.status}] ${check.name} (${exit})`);
    if (check.outputExcerpt) lines.push(check.outputExcerpt.trimEnd());
  }
  return lines.join("\n");
}
