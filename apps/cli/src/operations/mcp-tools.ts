import type { Context } from "../context.js";
import { loadManifest } from "../manifest/runtime.js";
import { buildToolList } from "../mcp/tool-router.js";
import type { McpTool } from "../mcp/types.js";

// Returns the MCP tool list a client would see for the current manifest. Kept
// here (and not in `mcp/`) so commands and other operations can compose
// against the same shape without importing the bridge directly.
export async function loadMcpToolList(
  _ctx: Context,
  opts: { includeAlpha: boolean },
): Promise<readonly McpTool[]> {
  const manifest = await loadManifest({ includeAlpha: opts.includeAlpha });
  return buildToolList(manifest);
}
