# Adding a Command

solcli supports auto-discovered commands. Add a command by creating a single
TypeScript file under `apps/cli/src/commands/`. The build script walks command
files and emits `apps/cli/src/generated/commands.ts` on `pnpm build`.

## Convention

- Leaf command: `apps/cli/src/commands/<noun>/<verb>.command.ts`.
- Root command: `apps/cli/src/commands/<name>.command.ts`.
- Groups may define an `index.ts`, but the registry can synthesize a group when
  only nested `*.command.ts` files exist.

## Template

```typescript
import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "example", description: "Short description" },
  args: {
    subject: { type: "positional", required: true, valueHint: "<subject>" },
    count: { type: "string", default: "1" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const n = Number.parseInt(String(args.count), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw ctx.errors.usage("--count must be a positive integer");
      }
      await ctx.output.write({ subject: String(args.subject), n });
    });
  },
});
```

## Build and Run

```bash
pnpm build
node apps/cli/dist/bin/solcli.js example demo --count 3 --output json
```

## Rules

- Use `withContext(async (ctx) => ...)` to access services.
- Do not import config, secrets, output, prompts, cache, providers, logger or errors directly.
- Throw typed failures through `ctx.errors.*(...)`.
- Write all output through `ctx.output`.
- Long-running operations must respect `ctx.abortController.signal`.

## Tests

Add command unit tests under `apps/cli/tests/unit/commands/` and end-to-end
tests under `apps/cli/tests/integration/`.
