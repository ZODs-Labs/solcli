import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDevnullSink,
  createFd3Sink,
  createFileSink,
  type EventSink,
  pickSink,
} from "../src/sinks.js";

describe("pickSink", () => {
  const env: NodeJS.ProcessEnv = {};
  const throwingFactory = (): never => {
    throw new Error("fd 3 unavailable in test runner");
  };

  const cases: Array<{
    name: string;
    opts: {
      agentMode: boolean;
      eventsFlag?: "ndjson" | "off" | "file";
      filePath?: string;
    };
    expected: EventSink["kind"];
  }> = [
    {
      name: "agent mode without ndjson flag selects fd3 (falls back to devnull when fd 3 absent)",
      opts: { agentMode: true },
      expected: "devnull",
    },
    {
      name: "agent mode with explicit off flag selects fd3 (falls back to devnull when fd 3 absent)",
      opts: { agentMode: true, eventsFlag: "off" },
      expected: "devnull",
    },
    {
      name: "agent mode with ndjson flag uses stdout",
      opts: { agentMode: true, eventsFlag: "ndjson" },
      expected: "stdout",
    },
    {
      name: "non-agent ndjson uses stdout",
      opts: { agentMode: false, eventsFlag: "ndjson" },
      expected: "stdout",
    },
    {
      name: "non-agent file flag with path uses file",
      opts: { agentMode: false, eventsFlag: "file", filePath: "/tmp/events.ndjson" },
      expected: "file",
    },
    {
      name: "non-agent file flag without path falls back to devnull",
      opts: { agentMode: false, eventsFlag: "file" },
      expected: "devnull",
    },
    {
      name: "non-agent default uses devnull",
      opts: { agentMode: false },
      expected: "devnull",
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const sink = pickSink(
        {
          ...c.opts,
          onFd3Unavailable: () => undefined,
          fd3StreamFactory: throwingFactory,
        },
        env,
      );
      expect(sink.kind).toBe(c.expected);
      await sink.close();
    });
  }
});

describe("createDevnullSink", () => {
  it("write is a no-op and flush/close resolve", async () => {
    const sink = createDevnullSink();
    expect(sink.kind).toBe("devnull");
    sink.write("anything\n");
    await sink.flush();
    await sink.close();
  });
});

describe("createFd3Sink", () => {
  it("falls back to devnull and calls onUnavailable when the stream factory throws", () => {
    let called = 0;
    const sink = createFd3Sink({
      onUnavailable: () => {
        called += 1;
      },
      createStream: () => {
        throw new Error("EBADF");
      },
    });
    expect(sink.kind).toBe("devnull");
    expect(called).toBe(1);
  });

  it("uses the injected stream factory when it succeeds", () => {
    const writes: string[] = [];
    const fakeStream = {
      write: (chunk: string): boolean => {
        writes.push(chunk);
        return true;
      },
      on: (_event: string, _cb: (err: NodeJS.ErrnoException) => void): unknown => fakeStream,
      end: (cb: () => void): void => cb(),
      writableNeedDrain: false,
      once: (_event: string, _cb: () => void): unknown => fakeStream,
    } as unknown as ReturnType<typeof Object>;
    const sink = createFd3Sink({
      createStream: () => fakeStream as never,
    });
    expect(sink.kind).toBe("fd3");
    sink.write("hello\n");
    expect(writes).toEqual(["hello\n"]);
  });
});

describe("createFileSink", () => {
  it("appends serialized writes and honors 0o600 mode on POSIX", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-events-"));
    const filePath = join(dir, "events.ndjson");
    const sink = createFileSink(filePath);
    sink.write('{"a":1}\n');
    sink.write('{"b":2}\n');
    await sink.flush();
    await sink.close();
    const contents = await readFile(filePath, "utf8");
    expect(contents).toBe('{"a":1}\n{"b":2}\n');
    if (process.platform !== "win32") {
      const info = await stat(filePath);
      expect(info.mode & 0o777).toBe(0o600);
    }
  });
});
