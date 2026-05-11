import type {
  PluginContributions,
  PluginIdlContribution,
  PluginManifest,
  PluginNetwork,
  PluginPermission,
  PluginSignerMode,
  TrustTier,
} from "@solcli/contracts";
import { PluginInvalidManifestError } from "@solcli/errors";

const TRUST_TIERS: readonly TrustTier[] = ["verified", "community", "local"];
const NETWORKS: readonly PluginNetwork[] = ["mainnet-beta", "devnet", "testnet", "custom"];
const SIGNER_MODES: readonly PluginSignerMode[] = ["never", "request", "always"];

/**
 * Closed set of host-known ports. A plugin that requests a port outside this
 * set is unsatisfiable (no provider can ever bind it) so the manifest is
 * rejected at load time per AC3. Mirrors the PortName union in
 * packages/contracts/src/ports/index.ts; update both together if a new port
 * lands.
 */
const KNOWN_PORTS: readonly string[] = [
  "getBalance",
  "getPortfolio",
  "getTokenBalances",
  "getAssetsByOwner",
  "getPriorityFeeEstimate",
  "getTransaction",
  "getTransactionHistory",
  "subscribeSignatures",
  "executeTransaction",
  "simulateTransaction",
  "getPriorityFeePolicy",
  "submitBundle",
  "signTransaction",
  "signerInfo",
  "proposeMultisigTx",
  "idlFetch",
  "pluginLoad",
  "emitEvent",
  "safetyEvaluate",
];

interface PathCursor {
  readonly path: readonly (string | number)[];
}

function pathOf(cursor: PathCursor, segment: string | number): PathCursor {
  return { path: [...cursor.path, segment] };
}

function pathString(cursor: PathCursor): string {
  if (cursor.path.length === 0) return "<root>";
  let out = "";
  for (const segment of cursor.path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      out += out === "" ? segment : `.${segment}`;
    }
  }
  return out;
}

function fail(cursor: PathCursor, reason: string): never {
  throw new PluginInvalidManifestError(
    `Invalid plugin manifest at ${pathString(cursor)}: ${reason}`,
    {
      details: { path: cursor.path, reason },
    },
  );
}

function ensureRecord(value: unknown, cursor: PathCursor): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(cursor, "expected object");
  }
  return value as Record<string, unknown>;
}

function ensureString(
  value: unknown,
  cursor: PathCursor,
  opts: { minLength?: number } = {},
): string {
  if (typeof value !== "string") fail(cursor, "expected string");
  const minLength = opts.minLength ?? 1;
  if (value.length < minLength) fail(cursor, `expected non-empty string (min length ${minLength})`);
  return value;
}

function ensureLiteral<T extends string>(
  value: unknown,
  cursor: PathCursor,
  allowed: readonly T[],
): T {
  const str = ensureString(value, cursor);
  if (!allowed.includes(str as T)) {
    fail(cursor, `expected one of ${allowed.join(", ")}, got ${JSON.stringify(str)}`);
  }
  return str as T;
}

function ensureArrayOfStrings(value: unknown, cursor: PathCursor): readonly string[] {
  if (!Array.isArray(value)) fail(cursor, "expected array of strings");
  const out: string[] = [];
  value.forEach((item, idx) => {
    out.push(ensureString(item, pathOf(cursor, idx)));
  });
  return out;
}

function ensureArrayOfLiterals<T extends string>(
  value: unknown,
  cursor: PathCursor,
  allowed: readonly T[],
): readonly T[] {
  if (!Array.isArray(value)) fail(cursor, "expected array");
  const out: T[] = [];
  value.forEach((item, idx) => {
    out.push(ensureLiteral(item, pathOf(cursor, idx), allowed));
  });
  return out;
}

function parsePermission(value: unknown, cursor: PathCursor): PluginPermission {
  const obj = ensureRecord(value, cursor);
  const portsCursor = pathOf(cursor, "ports");
  const ports = ensureArrayOfStrings(obj["ports"], portsCursor);
  ports.forEach((port, idx) => {
    if (!KNOWN_PORTS.includes(port)) {
      fail(
        pathOf(portsCursor, idx),
        `requested port '${port}' is not a host-known port; no provider can bind it`,
      );
    }
  });
  const network = ensureArrayOfLiterals(obj["network"], pathOf(cursor, "network"), NETWORKS);
  const signer = ensureLiteral(obj["signer"], pathOf(cursor, "signer"), SIGNER_MODES);
  const permission: { -readonly [K in keyof PluginPermission]: PluginPermission[K] } = {
    ports,
    network,
    signer,
  };
  if (obj["fs"] !== undefined) {
    permission.fs = ensureArrayOfStrings(obj["fs"], pathOf(cursor, "fs"));
  }
  if (obj["env"] !== undefined) {
    permission.env = ensureArrayOfStrings(obj["env"], pathOf(cursor, "env"));
  }
  if (obj["rpc"] !== undefined) {
    permission.rpc = ensureArrayOfStrings(obj["rpc"], pathOf(cursor, "rpc"));
  }
  return permission;
}

function parseIdlContribution(value: unknown, cursor: PathCursor): PluginIdlContribution {
  const obj = ensureRecord(value, cursor);
  return {
    programId: ensureString(obj["programId"], pathOf(cursor, "programId")),
    path: ensureString(obj["path"], pathOf(cursor, "path")),
  };
}

function parseContributions(value: unknown, cursor: PathCursor): PluginContributions {
  const obj = ensureRecord(value, cursor);
  const out: { -readonly [K in keyof PluginContributions]: PluginContributions[K] } = {};
  if (obj["ports"] !== undefined) {
    const contribCursor = pathOf(cursor, "ports");
    const portsList = ensureArrayOfStrings(obj["ports"], contribCursor);
    portsList.forEach((port, idx) => {
      if (!KNOWN_PORTS.includes(port)) {
        fail(pathOf(contribCursor, idx), `contributed port '${port}' is not a host-known port`);
      }
    });
    out.ports = portsList;
  }
  if (obj["commands"] !== undefined) {
    out.commands = ensureArrayOfStrings(obj["commands"], pathOf(cursor, "commands"));
  }
  if (obj["signers"] !== undefined) {
    out.signers = ensureArrayOfStrings(obj["signers"], pathOf(cursor, "signers"));
  }
  if (obj["idls"] !== undefined) {
    const raw = obj["idls"];
    if (!Array.isArray(raw)) fail(pathOf(cursor, "idls"), "expected array");
    out.idls = raw.map((item, idx) =>
      parseIdlContribution(item, pathOf(pathOf(cursor, "idls"), idx)),
    );
  }
  return out;
}

const NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const INTEGRITY_PATTERN = /^sha384-[A-Za-z0-9+/]+=*$/;

export function verifyPluginManifest(json: unknown): PluginManifest {
  const root: PathCursor = { path: [] };
  const obj = ensureRecord(json, root);

  const schemaVersion = obj["schemaVersion"];
  if (schemaVersion !== 1) {
    fail(pathOf(root, "schemaVersion"), "expected literal 1");
  }

  const name = ensureString(obj["name"], pathOf(root, "name"));
  if (!NAME_PATTERN.test(name)) {
    fail(pathOf(root, "name"), "expected npm-compatible package name");
  }
  const version = ensureString(obj["version"], pathOf(root, "version"));
  if (!VERSION_PATTERN.test(version)) {
    fail(pathOf(root, "version"), "expected semver string");
  }
  const trust = ensureLiteral(obj["trust"], pathOf(root, "trust"), TRUST_TIERS);
  const integrity = ensureString(obj["integrity"], pathOf(root, "integrity"));
  if (!INTEGRITY_PATTERN.test(integrity)) {
    fail(pathOf(root, "integrity"), "expected sha384-<base64> Subresource-Integrity format");
  }
  const permissions = parsePermission(obj["permissions"], pathOf(root, "permissions"));
  const contributes = parseContributions(obj["contributes"], pathOf(root, "contributes"));

  return {
    schemaVersion: 1,
    name,
    version,
    trust,
    integrity,
    permissions,
    contributes,
  };
}
