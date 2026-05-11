import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLogger } from "../src/index.js";

describe("logger redacts secret-like fields", () => {
  it("redacts apiKey, password, mnemonic, privateKey, secretKey, authorization", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-red-"));
    const logger = await buildLogger({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      level: "info",
    });
    logger.info(
      {
        provider: { apiKey: "AAA-API-KEY-AAA" },
        auth: { password: "BBB-PWD-BBB" },
        wallet: {
          privateKey: "CCC-PRIV-CCC",
          secretKey: "DDD-SEC-DDD",
          mnemonic: "EEE-MNE-EEE",
        },
        headers: { authorization: "Bearer FFF-BEAR-FFF" },
      },
      "redaction test",
    );
    await logger.flush();
    await new Promise((r) => setTimeout(r, 100));
    const files = await readdir(dir);
    const logFile = files.find((f) => f.startsWith("solcli.") && f.endsWith(".log"));
    if (!logFile) throw new Error("log file not created");
    const contents = await readFile(join(dir, logFile), "utf8");
    expect(contents).not.toContain("AAA-API-KEY-AAA");
    expect(contents).not.toContain("BBB-PWD-BBB");
    expect(contents).not.toContain("CCC-PRIV-CCC");
    expect(contents).not.toContain("DDD-SEC-DDD");
    expect(contents).not.toContain("EEE-MNE-EEE");
    expect(contents).not.toContain("FFF-BEAR-FFF");
    expect(contents).toContain("[REDACTED]");
  });
});
