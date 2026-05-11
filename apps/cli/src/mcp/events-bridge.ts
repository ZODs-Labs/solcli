import type { EventRecord } from "@solcli/contracts";

export interface EventsWriterLike {
  subscribe(fn: (rec: EventRecord) => void): () => void;
}

export interface NotificationServerLike {
  notification: (n: { method: string; params: unknown }) => Promise<void>;
}

function shouldForward(rec: EventRecord): boolean {
  return rec.kind.startsWith("tx.") || rec.kind.startsWith("safety.gate.");
}

// Forwards solcli events to MCP progress notifications. Subscribes to the
// events writer and translates each forwarded record into a
// `notifications/progress` MCP notification keyed on `requestId`. Returns an
// unsubscribe function. Notification delivery is best-effort: errors are
// swallowed because the events stream is informational and must never break
// command dispatch.
export function bridgeEventsToProgress(
  server: NotificationServerLike,
  eventsWriter: EventsWriterLike,
  signal: AbortSignal,
): () => void {
  const unsubscribe = eventsWriter.subscribe((rec: EventRecord) => {
    if (!shouldForward(rec)) return;
    const dataObject =
      typeof rec.data === "object" && rec.data !== null
        ? (rec.data as Record<string, unknown>)
        : { value: rec.data };
    server
      .notification({
        method: "notifications/progress",
        params: {
          progressToken: rec.requestId,
          kind: rec.kind,
          time: rec.time,
          ...dataObject,
        },
      })
      .catch(() => {
        // best-effort
      });
  });
  const onAbort = (): void => {
    try {
      unsubscribe();
    } catch {
      // best-effort
    }
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return unsubscribe;
}
