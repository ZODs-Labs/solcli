import { once } from "node:events";
import type { Context } from "../context.js";
import { loadManifest } from "../manifest/runtime.js";
import { registerTools } from "./tool-router.js";
import type { CapabilityManifest, ImporterMap } from "./types.js";

interface ServerCtor {
  new (
    info: { name: string; version: string },
    opts: { capabilities: Record<string, unknown> },
  ): {
    setRequestHandler: (method: string, handler: (req: unknown) => Promise<unknown>) => void;
    connect: (transport: unknown) => Promise<void>;
    close: () => Promise<void>;
    notification: (n: { method: string; params: unknown }) => Promise<void>;
  };
}

interface StdioTransportCtor {
  new (): unknown;
}

function buildImporters(manifest: CapabilityManifest): ImporterMap {
  // Map manifest path "secrets.get" to importer for
  // "../commands/secrets/get.command.js". Dotted paths become directory
  // segments; the final segment becomes a `.command.js` file.
  const out: Record<string, () => Promise<{ default: unknown }>> = {};
  for (const path of Object.keys(manifest.commands)) {
    const segments = path.split(".");
    if (segments.length === 0) continue;
    const last = segments[segments.length - 1] ?? "";
    const dirs = segments.slice(0, -1);
    const target =
      dirs.length === 0
        ? `../commands/${last}.command.js`
        : `../commands/${dirs.join("/")}/${last}.command.js`;
    out[path] = async () => {
      const mod = (await import(target)) as { default: unknown };
      return mod;
    };
  }
  return Object.freeze(out);
}

export async function bootMcpServer(opts: { ctx: Context; includeAlpha: boolean }): Promise<void> {
  const { ctx, includeAlpha } = opts;
  const { Server } = (await import("@modelcontextprotocol/sdk/server/index.js")) as unknown as {
    Server: ServerCtor;
  };
  const { StdioServerTransport } = (await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  )) as unknown as { StdioServerTransport: StdioTransportCtor };
  const manifest = await loadManifest({ includeAlpha });

  const version = process.env["SOLCLI_VERSION"] ?? "0.0.1";
  const server = new Server(
    { name: "solcli", version },
    { capabilities: { tools: {}, logging: {} } },
  );

  const importers = buildImporters(manifest);
  registerTools(server, manifest, ctx, importers);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const signal = ctx.abortController.signal;
  if (!signal.aborted) {
    try {
      await once(signal as unknown as NodeJS.EventEmitter, "abort");
    } catch {
      // signal emit can throw on some shapes; fall through to close
    }
  }
  try {
    await server.close();
  } catch {
    // best-effort shutdown
  }
}
