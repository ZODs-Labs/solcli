import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: {
    name: "providers",
    description: "Explain the provider model and list registered providers",
  },
  async run() {
    return withContext(async (ctx) => {
      const active = ctx.providers.active();
      const registered = ctx.providers.list().map((p) => ({
        name: p.manifest.name,
        version: p.manifest.version,
        ports: [...p.manifest.ports],
      }));
      await ctx.output.write({
        active: active?.manifest.name ?? null,
        registered,
        ports: ctx.portNames,
        readmes: [
          "packages/providers/src/vendors/helius/README.md",
          "packages/providers/src/vendors/triton/README.md",
        ],
        notes: [
          "v0 ships scaffolding only; no concrete adapter is registered.",
          "Switch active provider via `solcli config set provider.active <name>`.",
          "See docs/architecture-providers.md for the vendor adapter pattern.",
        ],
      });
    });
  },
});
