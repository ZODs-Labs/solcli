import { InternalError } from "@solcli/errors";
import {
  createEnvSignerAdapter,
  createFileSignerAdapter,
  createKeychainSignerAdapter,
  type SignerAdapter,
  type SignerAdapterKind,
} from "@solcli/signer";

/**
 * Build a signer adapter for the given kind. The signer registry calls this
 * lazily, once per alias, the first time an alias is used. Stub kinds
 * (`remote`, `ledger`, `squads`) throw an `InternalError` documenting the
 * deferral, mirroring their behavior in the registry tests.
 */
export function createSignerAdapter(kind: SignerAdapterKind): SignerAdapter {
  switch (kind) {
    case "file":
      return createFileSignerAdapter();
    case "env":
      return createEnvSignerAdapter();
    case "keychain":
      return createKeychainSignerAdapter();
    default:
      throw new InternalError(`Signer adapter '${kind}' is not yet implemented in this build`);
  }
}
