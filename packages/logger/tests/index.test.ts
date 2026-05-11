import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLogger } from "../src/index.js";

describe("buildLogger", () => {
  it("creates a logger with all five levels and a child method", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "solcli-log-"));
    const logger = await buildLogger({
      paths: { data: tmp, config: tmp, cache: tmp, log: tmp, temp: tmp },
      level: "info",
    });
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");
    expect(typeof logger.flush).toBe("function");
  });

  it("redacts apiKey paths in logged objects", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "solcli-log-"));
    const logger = await buildLogger({
      paths: { data: tmp, config: tmp, cache: tmp, log: tmp, temp: tmp },
      level: "info",
    });
    logger.info({ provider: { apiKey: "SECRET-VALUE-12345" } }, "test event");
    await logger.flush();
    await new Promise((r) => setTimeout(r, 100));
    const files = await readdir(tmp);
    const logFile = files.find((f) => f.startsWith("solcli.") && f.endsWith(".log"));
    if (!logFile) throw new Error("log file not created");
    const contents = await readFile(join(tmp, logFile), "utf8");
    expect(contents).not.toContain("SECRET-VALUE-12345");
    expect(contents).toContain("[REDACTED]");
  });

  it("redacts password fields", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "solcli-log-"));
    const logger = await buildLogger({
      paths: { data: tmp, config: tmp, cache: tmp, log: tmp, temp: tmp },
      level: "info",
    });
    logger.info({ auth: { password: "PWD-SECRET-99" } }, "auth event");
    await logger.flush();
    await new Promise((r) => setTimeout(r, 100));
    const files = await readdir(tmp);
    const logFile = files.find((f) => f.startsWith("solcli.") && f.endsWith(".log"));
    if (!logFile) throw new Error("log file not created");
    const contents = await readFile(join(tmp, logFile), "utf8");
    expect(contents).not.toContain("PWD-SECRET-99");
  });
});
