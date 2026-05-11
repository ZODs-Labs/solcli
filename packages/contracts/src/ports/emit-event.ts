import type { EventRecord } from "../domain/event-record.js";

export interface EmitEventPort {
  emit(record: EventRecord): void;
  flush(): Promise<void>;
}
