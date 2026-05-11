import * as clack from "@clack/prompts";
import type { PromptsService } from "@solcli/contracts";
import { NonInteractiveError } from "@solcli/errors";
import { isNonInteractive } from "@solcli/platform";

export interface ClackPromptsOptions {
  noInput?: boolean;
}

export class ClackPrompts implements PromptsService {
  private readonly noInput: boolean;

  constructor(opts: ClackPromptsOptions = {}) {
    this.noInput = opts.noInput ?? false;
  }

  private guard(message: string): void {
    if (isNonInteractive(this.noInput)) {
      throw new NonInteractiveError(`Cannot prompt in non-interactive mode: ${message}`, {
        details: { reason: "non-interactive", prompt: message },
      });
    }
  }

  async text(opts: { message: string; placeholder?: string; initial?: string }): Promise<string> {
    this.guard(opts.message);
    const params: Parameters<typeof clack.text>[0] = { message: opts.message };
    if (opts.placeholder !== undefined) params.placeholder = opts.placeholder;
    if (opts.initial !== undefined) params.initialValue = opts.initial;
    const v = await clack.text(params);
    if (typeof v === "symbol") {
      throw new NonInteractiveError(`Prompt cancelled: ${opts.message}`);
    }
    return String(v ?? "");
  }

  async password(opts: { message: string }): Promise<string> {
    this.guard(opts.message);
    const v = await clack.password({ message: opts.message });
    if (typeof v === "symbol") {
      throw new NonInteractiveError(`Prompt cancelled: ${opts.message}`);
    }
    return String(v ?? "");
  }

  async confirm(opts: { message: string; initial?: boolean }): Promise<boolean> {
    this.guard(opts.message);
    const v = await clack.confirm({
      message: opts.message,
      initialValue: opts.initial ?? false,
    });
    if (typeof v === "symbol") {
      throw new NonInteractiveError(`Prompt cancelled: ${opts.message}`);
    }
    return Boolean(v);
  }

  async select<V extends string>(opts: {
    message: string;
    options: { value: V; label: string; hint?: string }[];
    initial?: V;
  }): Promise<V> {
    this.guard(opts.message);
    const params: Parameters<typeof clack.select>[0] = {
      message: opts.message,
      options: opts.options,
    };
    if (opts.initial !== undefined) params.initialValue = opts.initial;
    const v = await clack.select(params);
    if (typeof v === "symbol") {
      throw new NonInteractiveError(`Prompt cancelled: ${opts.message}`);
    }
    return v as V;
  }
}

export function createPrompts(opts: ClackPromptsOptions = {}): PromptsService {
  return new ClackPrompts(opts);
}
