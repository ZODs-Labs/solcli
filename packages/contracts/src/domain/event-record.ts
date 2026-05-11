export type EventKind =
  | "tx.build"
  | "tx.simulate"
  | "tx.fee.estimated"
  | "tx.signed"
  | "tx.sent"
  | "tx.confirmed"
  | "tx.failed"
  | "safety.gate.passed"
  | "safety.gate.rejected"
  | "intent.emitted"
  | "plugin.loaded"
  | "plugin.refused"
  | "idl.synthesized";

export interface EventRecord<K extends EventKind = EventKind, T = unknown> {
  readonly schemaVersion: 1;
  readonly kind: K;
  readonly time: string;
  readonly requestId: string;
  readonly data: T;
}
