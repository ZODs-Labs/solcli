import type { Paths } from "@solcli/contracts";
import envPaths from "env-paths";

// suffix: "" disables env-paths' default "-nodejs" suffix.
export function buildPaths(appName = "solcli"): Paths {
  const p = envPaths(appName, { suffix: "" });
  return {
    data: p.data,
    config: p.config,
    cache: p.cache,
    log: p.log,
    temp: p.temp,
  };
}
