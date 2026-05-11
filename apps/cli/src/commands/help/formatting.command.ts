import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "formatting", description: "Explain color, no-color, FORCE_COLOR, TTY rules" },
  async run() {
    return withContext(async (ctx) =>
      ctx.output.write({
        precedence: [
          "1. --no-color CLI flag (highest)",
          "2. FORCE_COLOR env var (any non-empty value forces color)",
          "3. NO_COLOR env var (any non-empty value disables color)",
          "4. TTY detection (color only if stdout is a TTY)",
        ],
        notes: [
          "Agents piping stdout get color-free output automatically.",
          "Set FORCE_COLOR=1 to keep color in CI logs (most CI systems handle ANSI).",
          "See https://no-color.org and https://force-color.org for the informal specs.",
        ],
      }),
    );
  },
});
