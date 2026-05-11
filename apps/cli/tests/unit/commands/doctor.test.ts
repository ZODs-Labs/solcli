import { describe, expect, it } from "vitest";
import doctor from "../../../src/commands/doctor.command.js";

describe("doctor command", () => {
  it("has meta and run", () => {
    const meta = (doctor as { meta: { name: string } }).meta;
    expect(meta.name).toBe("doctor");
    const run = (doctor as { run: unknown }).run;
    expect(typeof run).toBe("function");
  });
});
