import process from "node:process";

export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function isStderrTTY(): boolean {
  return Boolean(process.stderr.isTTY);
}

// Precedence: --no-color > FORCE_COLOR > NO_COLOR > isTTY.
export function shouldColor(noColorFlag?: boolean): boolean {
  if (noColorFlag === true) return false;
  const forceColor = process.env["FORCE_COLOR"];
  const noColor = process.env["NO_COLOR"];
  if (forceColor && forceColor !== "0") return true;
  if (noColor && noColor !== "") return false;
  return isTTY();
}

export function terminalWidth(): number {
  const cols = process.stdout.columns;
  if (typeof cols === "number" && cols > 0) return cols;
  return 80;
}

export function supportsUnicode(): boolean {
  if (process.platform !== "win32") return true;
  return Boolean(process.env["WT_SESSION"] || process.env["WT_PROFILE_ID"]);
}

export function isNonInteractive(noInputFlag?: boolean): boolean {
  if (noInputFlag === true) return true;
  const ci = process.env["CI"];
  const noInput = process.env["NO_INPUT"];
  if (ci && ci !== "") return true;
  if (noInput && noInput !== "") return true;
  return !isTTY();
}
