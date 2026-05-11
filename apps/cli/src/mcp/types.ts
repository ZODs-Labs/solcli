// Local types for the in-binary MCP bridge. The capability-manifest shapes
// are re-exported from `../manifest/build.js`; the bridge keeps its own
// MCP-facing types here so consumers (commands, operations) import a single
// surface.

export type {
  CapabilityManifest,
  CommandManifestEntry,
  StabilityTier,
} from "../manifest/build.js";

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
}

export interface McpToolContent {
  readonly type: "text";
  readonly text: string;
}

export interface McpToolResult {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<McpToolContent>;
}

export type CommandImporter = () => Promise<{ default: unknown }>;
export type ImporterMap = Readonly<Record<string, CommandImporter>>;
