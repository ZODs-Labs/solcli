export type CittyArgType = "string" | "positional" | "boolean" | "number" | "enum";

export interface CittyArgSpec {
  readonly type?: CittyArgType;
  readonly required?: boolean;
  readonly default?: unknown;
  readonly options?: readonly string[];
  readonly description?: string;
  readonly valueHint?: string;
}

interface JsonSchemaPropertyString {
  readonly type: "string";
  readonly description?: string;
  readonly default?: string;
  readonly enum?: readonly string[];
}

interface JsonSchemaPropertyBoolean {
  readonly type: "boolean";
  readonly description?: string;
  readonly default?: boolean;
}

interface JsonSchemaPropertyNumber {
  readonly type: "number";
  readonly description?: string;
  readonly default?: number;
}

type JsonSchemaProperty =
  | JsonSchemaPropertyString
  | JsonSchemaPropertyBoolean
  | JsonSchemaPropertyNumber;

export interface JsonSchemaObject {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function mapArgToProperty(spec: CittyArgSpec): JsonSchemaProperty {
  const desc = isString(spec.description) ? spec.description : undefined;
  switch (spec.type) {
    case "boolean": {
      const prop: JsonSchemaPropertyBoolean = {
        type: "boolean",
        ...(desc !== undefined ? { description: desc } : {}),
        ...(isBoolean(spec.default) ? { default: spec.default } : {}),
      };
      return prop;
    }
    case "number": {
      const prop: JsonSchemaPropertyNumber = {
        type: "number",
        ...(desc !== undefined ? { description: desc } : {}),
        ...(isNumber(spec.default) ? { default: spec.default } : {}),
      };
      return prop;
    }
    case "enum": {
      const options = Array.isArray(spec.options) ? [...spec.options].sort() : [];
      const prop: JsonSchemaPropertyString = {
        type: "string",
        ...(desc !== undefined ? { description: desc } : {}),
        ...(isString(spec.default) ? { default: spec.default } : {}),
        enum: options,
      };
      return prop;
    }
    default: {
      const prop: JsonSchemaPropertyString = {
        type: "string",
        ...(desc !== undefined ? { description: desc } : {}),
        ...(isString(spec.default) ? { default: spec.default } : {}),
      };
      return prop;
    }
  }
}

export function cittyArgsToJsonSchema(args: Record<string, CittyArgSpec>): JsonSchemaObject {
  const keys = Object.keys(args).sort((a, b) => a.localeCompare(b));
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const key of keys) {
    const spec = args[key];
    if (spec === undefined) continue;
    properties[key] = mapArgToProperty(spec);
    if (spec.required === true) required.push(key);
  }
  required.sort((a, b) => a.localeCompare(b));
  const result: JsonSchemaObject = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
  return result;
}
