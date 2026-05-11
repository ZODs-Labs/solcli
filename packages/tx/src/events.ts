import type { EmitEventPort, EventKind, EventRecord } from "@solcli/contracts";

export interface EventEmitContext {
  readonly events: EmitEventPort | undefined;
  readonly clock: () => number;
  readonly requestId: string;
}

export function emitRecord<K extends EventKind, T>(
  ctx: EventEmitContext,
  kind: K,
  data: T,
): EventRecord<K, T> {
  const record: EventRecord<K, T> = {
    schemaVersion: 1,
    kind,
    time: new Date(ctx.clock()).toISOString(),
    requestId: ctx.requestId,
    data,
  };
  if (ctx.events !== undefined) {
    try {
      ctx.events.emit(record);
    } catch {
      // events channel is advisory; swallow emit failures to avoid disrupting tx flow.
    }
  }
  return record;
}
