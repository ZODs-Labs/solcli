// Ambient declarations for `@modelcontextprotocol/sdk`. The SDK is not
// installed in this workspace yet; runtime resolution is provided by the
// downstream wiring flow (mcp-sdk-install). These declarations exist so the
// in-binary bridge type-checks without the package present.

declare module "@modelcontextprotocol/sdk/server/index.js" {
  export class Server {
    constructor(
      info: { name: string; version: string },
      opts: { capabilities: Record<string, unknown> },
    );
    setRequestHandler(method: string, handler: (req: unknown) => unknown | Promise<unknown>): void;
    connect(transport: unknown): Promise<void>;
    close(): Promise<void>;
    notification(notification: { method: string; params: unknown }): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {
    constructor();
  }
}
