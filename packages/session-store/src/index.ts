import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { redactUnknown, type SessionEvent } from "@karya/shared-types";

export class SessionStore {
  readonly id: string;
  readonly filePath: string;

  private constructor(
    id: string,
    filePath: string,
    private readonly secrets: readonly string[],
  ) {
    this.id = id;
    this.filePath = filePath;
  }

  static async create(options: {
    workspaceRoot: string;
    secrets: readonly string[];
    directory?: string;
    id?: string;
  }): Promise<SessionStore> {
    const id = options.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const directory = options.directory ?? path.join(options.workspaceRoot, ".karya", "sessions");
    await mkdir(directory, { recursive: true });
    return new SessionStore(id, path.join(directory, `${id}.jsonl`), options.secrets);
  }

  async append(type: string, data: Record<string, unknown>): Promise<SessionEvent> {
    const event: SessionEvent = {
      ts: new Date().toISOString(),
      type,
      data: redactUnknown(data, this.secrets) as Record<string, unknown>,
    };
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }
}
