# Triton vendor adapter (placeholder)

v0 ships only the manifest and a factory shell. Real port implementations
land in v0.1 alongside the first set of port interfaces.

## Adding a port (v0.1 procedure)

1. Implement the port interface from `@solcli/contracts/src/ports/<name>.ts`
   in `packages/providers/src/vendors/triton/ports/<name>.ts`. Translate the
   Triton response shape to the domain type at this boundary.
2. List the port in `TRITON_MANIFEST.ports`.
3. Wire the port into the bindings map passed to `makeProviderInstance`.
4. Add unit tests under `packages/providers/tests/triton/` with recorded
   vendor fixtures (msw).

Triton's gRPC stream surface (Yellowstone) is a separate concern from the
HTTPS ports above. When it lands, gRPC code lives under `streams/` inside
this folder; it is a vendor-only operation (not a domain port).
