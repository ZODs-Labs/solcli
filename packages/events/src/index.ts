export { redactEventRecord } from "./redactor.js";
export type { EventKind, EventRecord } from "./schema.js";
export type { EventSink, EventSinkKind, Fd3SinkOptions, PickSinkOptions } from "./sinks.js";
export {
  createDevnullSink,
  createFd3Sink,
  createFileSink,
  createStdoutSink,
  pickSink,
} from "./sinks.js";
export type { DebugLogger, EventWriter, EventWriterOptions } from "./writer.js";
export { createEventWriter } from "./writer.js";
