import type { VersionCheck } from "@solcli/contracts";
import { isStderrTTY } from "@solcli/platform";
import updateNotifier from "update-notifier";

export interface VersionCheckOptions {
  pkg: { name: string; version: string };
  quiet?: boolean;
  disabled?: boolean;
}

export class UpdateNotifierVersionCheck implements VersionCheck {
  constructor(private readonly opts: VersionCheckOptions) {}

  maybeNotify(): void {
    if (this.opts.disabled) return;
    if (this.opts.quiet) return;
    if (process.env["NO_UPDATE_NOTIFIER"]) return;
    if (!isStderrTTY()) return;
    try {
      const notifier = updateNotifier({
        pkg: this.opts.pkg,
        updateCheckInterval: 1000 * 60 * 60 * 24,
      });
      notifier.notify({ defer: true, isGlobal: true });
    } catch {
      // Best-effort; never block or fail the CLI on version-check problems.
    }
  }
}

export function createVersionCheck(opts: VersionCheckOptions): VersionCheck {
  return new UpdateNotifierVersionCheck(opts);
}
