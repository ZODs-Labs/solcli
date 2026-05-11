import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "example", description: "Template plugin command (reference implementation)" },
  args: {
    subject: { type: "positional", required: true, valueHint: "<subject>" },
    count: { type: "string", default: "1", description: "How many records to emit (1-100)" },
    mode: { type: "enum", options: ["sync", "stream"], default: "sync" },
    fail: { type: "boolean", default: false, description: "Demonstrate the error path" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      if (args.fail) {
        throw ctx.errors.usage("Demonstration error from plugin/example", {
          details: { hint: "Run without --fail to see the success path" },
        });
      }
      const n = Number.parseInt(String(args.count), 10);
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        throw ctx.errors.usage("--count must be an integer between 1 and 100");
      }
      if (args.mode === "stream") {
        await ctx.output.writeStream(generate(String(args.subject), n));
      } else {
        const records: { i: number; subject: string }[] = [];
        for (let i = 0; i < n; i += 1) records.push({ i, subject: String(args.subject) });
        await ctx.output.write({ subject: String(args.subject), records });
      }
    });
  },
});

async function* generate(
  subject: string,
  n: number,
): AsyncIterable<{ i: number; subject: string }> {
  for (let i = 0; i < n; i += 1) yield { i, subject };
}
