import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { bootstrapExtensionHost } from "../../extensions/host.js";

export default defineCommand({
  meta: {
    name: "install",
    description: "Install a plugin (npm spec or local tarball/path) with integrity verification",
  },
  args: {
    spec: { type: "positional", required: true, valueHint: "<id>" },
    version: { type: "string", required: false, description: "Version (npm) or path (local)" },
    "from-path": { type: "string", required: false, description: "Install a local .tgz tarball" },
    trust: {
      type: "enum",
      options: ["verified", "community", "local"],
      default: "community",
    },
    integrity: { type: "string", required: false, description: "Pinned sha384-<base64> hash" },
    "yes-permissions": {
      type: "string",
      required: false,
      description: "Comma-separated approved permissions (e.g. signer)",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const host = bootstrapExtensionHost({ paths: ctx.paths, logger: ctx.logger });
      const yesPermsRaw = args["yes-permissions"];
      const yesPermissions =
        typeof yesPermsRaw === "string" && yesPermsRaw !== ""
          ? yesPermsRaw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : undefined;
      const interactive = process.stdin.isTTY === true && !ctx.flags.noInput;
      const result = await host.install({
        id: String(args.spec),
        ...(typeof args.version === "string" && args.version !== ""
          ? { version: String(args.version) }
          : {}),
        ...(typeof args["from-path"] === "string" && args["from-path"] !== ""
          ? { fromPath: String(args["from-path"]) }
          : {}),
        trust: args.trust as "verified" | "community" | "local",
        ...(typeof args.integrity === "string" && args.integrity !== ""
          ? { expectedIntegrity: String(args.integrity) }
          : {}),
        interactive,
        ...(yesPermissions !== undefined ? { yesPermissions } : {}),
        signal: ctx.abortController.signal,
      });
      await ctx.output.write({
        kind: "plugin.install",
        data: {
          name: result.manifest.name,
          version: result.manifest.version,
          trust: result.manifest.trust,
          integrity: result.integrity,
          installedAt: result.installedAt,
          pluginDir: result.pluginDir,
        },
        meta: {
          dataDir: ctx.paths.data,
        },
      });
    });
  },
});
