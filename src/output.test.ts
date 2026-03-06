import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveOutputFormat, isJsonMode, applyFieldMask } from "./output.js";

const withTTY = (isTTY: boolean | undefined, fn: () => void): void => {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, writable: true, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process.stdout, "isTTY", { value: original, writable: true, configurable: true });
  }
};

describe("resolveOutputFormat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["OUTPUT_FORMAT"];
  });

  it("returns json when --json flag is set", () => {
    expect(resolveOutputFormat({ json: true })).toBe("json");
  });

  it("returns json when --output json is set", () => {
    expect(resolveOutputFormat({ output: "json" })).toBe("json");
  });

  it("returns text when --output text is set", () => {
    expect(resolveOutputFormat({ output: "text" })).toBe("text");
  });

  it("returns json when OUTPUT_FORMAT env is json", () => {
    process.env["OUTPUT_FORMAT"] = "json";
    expect(resolveOutputFormat({})).toBe("json");
  });

  it("returns json when stdout is not a TTY", () => {
    withTTY(undefined, () => {
      expect(resolveOutputFormat({})).toBe("json");
    });
  });

  it("returns text when stdout is a TTY and no flags set", () => {
    withTTY(true, () => {
      expect(resolveOutputFormat({})).toBe("text");
    });
  });

  it("--json flag takes precedence over --output text", () => {
    expect(resolveOutputFormat({ json: true, output: "text" })).toBe("json");
  });
});

describe("isJsonMode", () => {
  it("returns true for json format", () => {
    expect(isJsonMode({ json: true })).toBe(true);
  });

  it("returns false for text format in TTY", () => {
    withTTY(true, () => {
      expect(isJsonMode({})).toBe(false);
    });
  });
});

describe("applyFieldMask", () => {
  const data = { domain: "example.com", score: 72, grade: "B", extra: "stuff" };

  it("returns full data when no fields specified", () => {
    expect(applyFieldMask(data)).toEqual(data);
  });

  it("returns full data when fields is undefined", () => {
    expect(applyFieldMask(data, undefined)).toEqual(data);
  });

  it("filters to specified fields", () => {
    expect(applyFieldMask(data, "domain,score")).toEqual({
      domain: "example.com",
      score: 72,
    });
  });

  it("handles whitespace in field list", () => {
    expect(applyFieldMask(data, "domain , grade")).toEqual({
      domain: "example.com",
      grade: "B",
    });
  });

  it("ignores non-existent fields", () => {
    expect(applyFieldMask(data, "domain,nonexistent")).toEqual({
      domain: "example.com",
    });
  });

  it("returns empty object for completely invalid fields", () => {
    expect(applyFieldMask(data, "foo,bar")).toEqual({});
  });
});
