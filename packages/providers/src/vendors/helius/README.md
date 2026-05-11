# Helius vendor adapter (placeholder)

v0 ships only the manifest and a factory shell. Real port implementations
land in v0.1 alongside the first set of port interfaces.

## Adding a port (v0.1 procedure)

1. Implement the port interface from `@solcli/contracts/src/ports/<name>.ts`
   in `packages/providers/src/vendors/helius/ports/<name>.ts`. Translate the
   Helius response shape to the domain type at this boundary.
2. List the port in `HELIUS_MANIFEST.ports` (`defineManifest("helius", "1", [...])`).
3. Wire the port into the bindings map passed to `makeProviderInstance`.
4. Add unit tests under `packages/providers/tests/helius/` with recorded
   vendor fixtures (msw).
