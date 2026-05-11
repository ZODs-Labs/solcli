import { describe, expect, it } from "vitest";
import { cittyArgsToJsonSchema } from "../../../src/manifest/zod-to-json-schema.js";

describe("cittyArgsToJsonSchema", () => {
  it("maps string and positional args to type:string", () => {
    const schema = cittyArgsToJsonSchema({
      key: { type: "positional", required: true, description: "Dotted key" },
      value: { type: "string", description: "Value to set" },
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        key: { type: "string", description: "Dotted key" },
        value: { type: "string", description: "Value to set" },
      },
      required: ["key"],
      additionalProperties: false,
    });
  });

  it("maps boolean args with default", () => {
    const schema = cittyArgsToJsonSchema({
      fail: { type: "boolean", default: false, description: "Fail path" },
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        fail: { type: "boolean", default: false, description: "Fail path" },
      },
      additionalProperties: false,
    });
  });

  it("maps enum args to type:string with sorted enum options", () => {
    const schema = cittyArgsToJsonSchema({
      mode: { type: "enum", options: ["sync", "stream"], default: "sync" },
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        mode: { type: "string", enum: ["stream", "sync"], default: "sync" },
      },
      additionalProperties: false,
    });
  });

  it("sorts properties alphabetically for deterministic output", () => {
    const schemaA = cittyArgsToJsonSchema({
      zeta: { type: "string" },
      alpha: { type: "string" },
      mu: { type: "boolean", default: true },
    });
    const schemaB = cittyArgsToJsonSchema({
      mu: { type: "boolean", default: true },
      alpha: { type: "string" },
      zeta: { type: "string" },
    });
    expect(JSON.stringify(schemaA)).toBe(JSON.stringify(schemaB));
    const props = (schemaA as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("collects multiple required args alphabetically", () => {
    const schema = cittyArgsToJsonSchema({
      foo: { type: "string", required: true },
      bar: { type: "string", required: true },
      opt: { type: "string" },
    });
    const required = (schema as { required: readonly string[] }).required;
    expect(required).toEqual(["bar", "foo"]);
  });

  it("omits required array when no args are required", () => {
    const schema = cittyArgsToJsonSchema({
      foo: { type: "string" },
    });
    expect("required" in schema).toBe(false);
  });
});
