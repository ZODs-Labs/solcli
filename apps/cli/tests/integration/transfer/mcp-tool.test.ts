import { describe, it } from "vitest";

describe("transfer command via MCP tool router", () => {
  /**
   * MCP tool router round-trip is gated on the peer wiring session.
   *
   * apps/cli/src/mcp/tool-router (the path named in the brief) exists but
   * its CLI command dispatch surface is still being shaped; once the router
   * accepts a command name plus argv and returns the structured envelope,
   * this test should:
   *
   *   1. Invoke transfer with --simulate via the in-process MCP router
   *   2. Assert the returned envelope has kind === "transfer.simulation"
   *   3. Assert parent stdout received zero bytes during the invocation
   *      (everything must flow through the router response channel)
   *
   * TODO: wiring -- swap in the real MCP router once it ships and drop
   * this skip. Keep the contract-pinning assertions above.
   */
  it.skip("round-trips transfer.simulation through the MCP tool router", () => {
    // No-op until the MCP router lands.
  });
});
