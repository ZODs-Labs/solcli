import process from "node:process";

let activeAbortController: AbortController | undefined;

export function registerAbortController(controller: AbortController): void {
  activeAbortController = controller;
}

export function installSignalHandlers(): void {
  const handle = (signal: "SIGINT" | "SIGTERM") => {
    try {
      activeAbortController?.abort(signal);
    } catch {
      // best-effort cancellation
    }
    const code = signal === "SIGINT" ? 130 : 143;
    setTimeout(() => process.exit(code), 0).unref();
  };
  process.on("SIGINT", () => handle("SIGINT"));
  process.on("SIGTERM", () => handle("SIGTERM"));
}

export function lineEnding(): "\n" | "\r\n" {
  return process.platform === "win32" ? "\r\n" : "\n";
}

export function isWindowsTerminal(): boolean {
  return Boolean(process.env["WT_SESSION"] || process.env["WT_PROFILE_ID"]);
}
