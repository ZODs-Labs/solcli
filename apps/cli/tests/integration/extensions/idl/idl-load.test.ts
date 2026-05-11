import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Paths } from "@solcli/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Context } from "../../../../src/context.js";
import { synthesizeCommands } from "../../../../src/extensions/idl-synth.js";
import { createPluginRegistry } from "../../../../src/extensions/registry.js";
import {
  idlAdd,
  idlCachePath,
  idlList,
  idlRemove,
  idlsDir,
  overlaysForSynthesizedIdl,
} from "../../../../src/operations/idl-load.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../fixtures/idl");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const CUSTOM_PROGRAM_ID = "Custom1111111111111111111111111111111111111";

interface Harness {
  readonly ctx: Context;
  readonly dir: string;
}

async function makeHarness(): Promise<Harness> {
  const dir = await mkdtemp(path.join(tmpdir(), "solcli-idl-"));
  const paths: Paths = {
    data: dir,
    config: dir,
    cache: dir,
    log: dir,
    temp: dir,
  };
  const ctx = {
    paths,
    abortController: new AbortController(),
    config: {
      activeProfile: () => "default",
      configPath: () => path.join(dir, "config.toml"),
      read: () => ({}),
    },
    logger: { debug: () => undefined, info: () => undefined },
    output: { write: async () => undefined },
  } as unknown as Context;
  return { ctx, dir };
}

describe("idl-load operations", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(async () => {
    // best-effort cleanup; the temp dir lives under tmpdir().
  });

  it("idlAdd writes the IDL cache file atomically and returns synthesized command paths", async () => {
    const fromPath = path.join(FIXTURES, "memo.idl.json");
    const result = await idlAdd(harness.ctx, { programId: MEMO_PROGRAM_ID, fromPath });
    expect(result.programId).toBe(MEMO_PROGRAM_ID);
    expect(result.label).toBe("memo");
    expect(result.instructions).toEqual(["memo"]);
    expect(result.synthesized).toEqual([{ path: "program.memo.memo", stability: "alpha" }]);
    expect(result.overlays).toHaveLength(1);
    const overlay = result.overlays[0];
    expect(overlay?.commandPath).toBe("program.memo.memo");
    expect(overlay?.entry.stability).toBe("alpha");
    expect(overlay?.entry.synthesized).toBe(true);
    expect(overlay?.contributedBy).toBe(`idl:${MEMO_PROGRAM_ID}`);

    const cached = idlCachePath(harness.ctx, MEMO_PROGRAM_ID);
    const body = await readFile(cached, "utf8");
    const parsed = JSON.parse(body) as { metadata: { name: string } };
    expect(parsed.metadata.name).toBe("memo");

    // No leftover .tmp.* files: rename moved the temp into place.
    const entries = await readdir(idlsDir(harness.ctx));
    const leftover = entries.filter((e) => e.includes(".tmp."));
    expect(leftover).toEqual([]);
  });

  it("idlAdd accepts a --label override and persists it in labels.json", async () => {
    const fromPath = path.join(FIXTURES, "memo.idl.json");
    const result = await idlAdd(harness.ctx, {
      programId: MEMO_PROGRAM_ID,
      fromPath,
      label: "scratch",
    });
    expect(result.label).toBe("scratch");
    const labelsBody = await readFile(path.join(idlsDir(harness.ctx), "labels.json"), "utf8");
    const labels = JSON.parse(labelsBody) as Record<string, string>;
    expect(labels[MEMO_PROGRAM_ID]).toBe("scratch");
  });

  it("idlList returns every cached IDL with its instruction count", async () => {
    await idlAdd(harness.ctx, {
      programId: MEMO_PROGRAM_ID,
      fromPath: path.join(FIXTURES, "memo.idl.json"),
    });
    await idlAdd(harness.ctx, {
      programId: CUSTOM_PROGRAM_ID,
      fromPath: path.join(FIXTURES, "custom-struct.idl.json"),
    });
    const listing = await idlList(harness.ctx);
    expect(listing.count).toBe(2);
    const memoEntry = listing.entries.find((e) => e.programId === MEMO_PROGRAM_ID);
    const customEntry = listing.entries.find((e) => e.programId === CUSTOM_PROGRAM_ID);
    expect(memoEntry?.instructionCount).toBe(1);
    expect(memoEntry?.label).toBe("memo");
    expect(customEntry?.instructionCount).toBe(1);
  });

  it("idlList returns an empty listing when the cache directory does not exist", async () => {
    const listing = await idlList(harness.ctx);
    expect(listing.count).toBe(0);
    expect(listing.entries).toEqual([]);
  });

  it("idlRemove atomically deletes the cache file by program id", async () => {
    await idlAdd(harness.ctx, {
      programId: MEMO_PROGRAM_ID,
      fromPath: path.join(FIXTURES, "memo.idl.json"),
    });
    const cached = idlCachePath(harness.ctx, MEMO_PROGRAM_ID);
    expect(await readFile(cached, "utf8")).toContain("memo");
    const result = await idlRemove(harness.ctx, { programIdOrLabel: MEMO_PROGRAM_ID });
    expect(result.programId).toBe(MEMO_PROGRAM_ID);
    let stillThere = true;
    try {
      await readFile(cached, "utf8");
    } catch {
      stillThere = false;
    }
    expect(stillThere).toBe(false);
  });

  it("idlRemove resolves a user-set label back to the program id", async () => {
    await idlAdd(harness.ctx, {
      programId: MEMO_PROGRAM_ID,
      fromPath: path.join(FIXTURES, "memo.idl.json"),
      label: "myMemo",
    });
    const result = await idlRemove(harness.ctx, { programIdOrLabel: "myMemo" });
    expect(result.programId).toBe(MEMO_PROGRAM_ID);
    const labelsBody = await readFile(path.join(idlsDir(harness.ctx), "labels.json"), "utf8");
    const labels = JSON.parse(labelsBody) as Record<string, string>;
    expect(labels[MEMO_PROGRAM_ID]).toBeUndefined();
  });

  it("overlaysForSynthesizedIdl produces overlays the plugin registry can absorb", async () => {
    const fromPath = path.join(FIXTURES, "memo.idl.json");
    const raw = await readFile(fromPath, "utf8");
    const idl = JSON.parse(raw) as Parameters<typeof synthesizeCommands>[0];
    const commands = synthesizeCommands(idl, { programLabel: "memo", programId: MEMO_PROGRAM_ID });
    const overlays = overlaysForSynthesizedIdl(MEMO_PROGRAM_ID, commands);

    const registry = createPluginRegistry();
    registry.addContribution(
      `idl:${MEMO_PROGRAM_ID}`,
      {
        schemaVersion: 1,
        name: `idl:${MEMO_PROGRAM_ID}`,
        version: "0.0.0",
        trust: "local",
        integrity: "",
        permissions: { ports: [], network: [], signer: "never" },
        contributes: {},
      },
      overlays,
    );
    const surfaced = registry.listManifestOverlays();
    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]?.commandPath).toBe("program.memo.memo");
    expect(surfaced[0]?.entry.stability).toBe("alpha");
  });

  it("idlAdd registers overlays with a plugin registry when ctx.extensions.plugins is wired", async () => {
    const registry = createPluginRegistry();
    (harness.ctx as unknown as { extensions: { plugins: unknown } }).extensions = {
      plugins: registry,
    };
    await idlAdd(harness.ctx, {
      programId: MEMO_PROGRAM_ID,
      fromPath: path.join(FIXTURES, "memo.idl.json"),
    });
    const overlays = registry.listManifestOverlays();
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.commandPath).toBe("program.memo.memo");
    expect(overlays[0]?.contributedBy).toBe(`idl:${MEMO_PROGRAM_ID}`);
  });

  it("idlRemove throws SOLCLI_E_IDL_NOT_FOUND when the IDL is not cached", async () => {
    // Pre-create the labels file so resolveProgramId does not error on lookup.
    await mkdir(idlsDir(harness.ctx), { recursive: true });
    await writeFile(
      path.join(idlsDir(harness.ctx), "labels.json"),
      JSON.stringify({ [MEMO_PROGRAM_ID]: "memo" }),
    );
    let caught: unknown;
    try {
      await idlRemove(harness.ctx, { programIdOrLabel: MEMO_PROGRAM_ID });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    if (caught && typeof caught === "object" && "code" in caught) {
      expect((caught as { code: string }).code).toBe("SOLCLI_E_IDL_NOT_FOUND");
    }
  });
});
