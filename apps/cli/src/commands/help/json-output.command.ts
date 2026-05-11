import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "json-output", description: "Explain --output json/ndjson semantics for agents" },
  async run() {
    return withContext(async (ctx) =>
      ctx.output.write({
        schemaVersion: 1,
        formats: ["human", "json", "ndjson", "csv"],
        notes: [
          "json: exactly one JSON document on stdout, terminating newline, no log noise.",
          "ndjson: one JSON object per line, LF only, suitable for streaming.",
          "Errors in JSON mode are emitted to stdout as { schemaVersion: 1, error: { code, message, exitCode, details, cause } }.",
          "BigInt is serialized as string. Date is serialized as ISO 8601.",
        ],
        envelope: {
          success: { schemaVersion: 1, data: "<T>" },
          error: { schemaVersion: 1, error: "<ErrorEnvelope>" },
        },
      }),
    );
  },
});
