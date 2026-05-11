export type TrustTier = "verified" | "community" | "local";
export type PluginNetwork = "mainnet-beta" | "devnet" | "testnet" | "custom";
export type PluginSignerMode = "never" | "request" | "always";

export interface PluginPermission {
  readonly ports: readonly string[];
  readonly network: readonly PluginNetwork[];
  readonly signer: PluginSignerMode;
  readonly fs?: readonly string[];
  readonly env?: readonly string[];
  readonly rpc?: readonly string[];
}

export interface PluginIdlContribution {
  readonly programId: string;
  readonly path: string;
}

export interface PluginContributions {
  readonly ports?: readonly string[];
  readonly commands?: readonly string[];
  readonly signers?: readonly string[];
  readonly idls?: readonly PluginIdlContribution[];
}

export interface PluginManifest {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly version: string;
  readonly trust: TrustTier;
  readonly integrity: string;
  readonly permissions: PluginPermission;
  readonly contributes: PluginContributions;
}
