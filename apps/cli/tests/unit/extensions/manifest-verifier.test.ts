import { ERROR_CODES, PluginInvalidManifestError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { verifyPluginManifest } from "../../../src/extensions/manifest-verifier.js";

const SAMPLE_INTEGRITY = "sha384-Zm9vYmFyMQ==";

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: "@example/solcli-plugin-demo",
    version: "1.2.3",
    trust: "community",
    integrity: SAMPLE_INTEGRITY,
    permissions: {
      ports: ["getBalance"],
      network: ["devnet"],
      signer: "never",
    },
    contributes: {
      commands: ["demo.hello"],
    },
    ...overrides,
  };
}

describe("verifyPluginManifest", () => {
  it("parses a valid manifest", () => {
    const out = verifyPluginManifest(validManifest());
    expect(out.name).toBe("@example/solcli-plugin-demo");
    expect(out.version).toBe("1.2.3");
    expect(out.trust).toBe("community");
    expect(out.permissions.signer).toBe("never");
    expect(out.contributes.commands).toEqual(["demo.hello"]);
  });

  it("preserves optional permission scopes", () => {
    const out = verifyPluginManifest(
      validManifest({
        permissions: {
          ports: ["getBalance"],
          network: ["mainnet-beta", "devnet"],
          signer: "request",
          fs: ["/tmp/plugin"],
          env: ["SOLCLI_PROFILE"],
          rpc: ["getBalance"],
        },
      }),
    );
    expect(out.permissions.fs).toEqual(["/tmp/plugin"]);
    expect(out.permissions.env).toEqual(["SOLCLI_PROFILE"]);
    expect(out.permissions.rpc).toEqual(["getBalance"]);
    expect(out.permissions.network).toEqual(["mainnet-beta", "devnet"]);
  });

  it("rejects a bad permission shape with SOLCLI_E_PLUGIN_INVALID_MANIFEST", () => {
    const bad = validManifest({
      permissions: {
        ports: "not-an-array",
        network: ["devnet"],
        signer: "never",
      },
    });
    let thrown: unknown;
    try {
      verifyPluginManifest(bad);
    } catch (err: unknown) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PluginInvalidManifestError);
    expect((thrown as PluginInvalidManifestError).code).toBe(ERROR_CODES.PLUGIN_INVALID_MANIFEST);
  });

  it("rejects an unknown signer mode", () => {
    expect(() =>
      verifyPluginManifest(
        validManifest({
          permissions: { ports: [], network: ["devnet"], signer: "yolo" },
        }),
      ),
    ).toThrow(PluginInvalidManifestError);
  });

  it("rejects an integrity hash with the wrong algorithm", () => {
    expect(() => verifyPluginManifest(validManifest({ integrity: "sha256-abcd" }))).toThrow(
      PluginInvalidManifestError,
    );
  });

  it("rejects schemaVersion mismatches", () => {
    expect(() => verifyPluginManifest(validManifest({ schemaVersion: 2 }))).toThrow(
      PluginInvalidManifestError,
    );
  });

  it("AC3: rejects an unsatisfiable port with SOLCLI_E_PLUGIN_INVALID_MANIFEST", () => {
    let thrown: unknown;
    try {
      verifyPluginManifest(
        validManifest({
          permissions: {
            ports: ["nonExistentPort"],
            network: ["devnet"],
            signer: "never",
          },
        }),
      );
    } catch (err: unknown) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PluginInvalidManifestError);
    expect((thrown as PluginInvalidManifestError).code).toBe(ERROR_CODES.PLUGIN_INVALID_MANIFEST);
    expect((thrown as Error).message).toContain("nonExistentPort");
  });

  it("AC3: rejects an unsatisfiable contributed port", () => {
    expect(() =>
      verifyPluginManifest(
        validManifest({
          contributes: { ports: ["totallyMadeUp"] },
        }),
      ),
    ).toThrow(PluginInvalidManifestError);
  });
});
