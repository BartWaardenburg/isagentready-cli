import { describe, it, expect } from "vitest";
import {
  validateDomain,
  validateUrl,
  validateCheckpointId,
  validateStage,
  validateStrength,
  validateArPractice,
  validateCategory,
  validateMethodologyVersion,
  ValidationError,
} from "./validate.js";

describe("validateDomain", () => {
  it("accepts a valid domain", () => {
    expect(validateDomain("example.com")).toBe("example.com");
  });

  it("normalizes to lowercase", () => {
    expect(validateDomain("Example.COM")).toBe("example.com");
  });

  it("strips protocol", () => {
    expect(validateDomain("https://example.com")).toBe("example.com");
    expect(validateDomain("http://example.com")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(validateDomain("www.example.com")).toBe("example.com");
  });

  it("strips path", () => {
    expect(validateDomain("example.com/path/to/page")).toBe("example.com");
  });

  it("strips everything combined", () => {
    expect(validateDomain("https://www.Example.COM/some/path")).toBe("example.com");
  });

  it("accepts subdomains", () => {
    expect(validateDomain("sub.example.com")).toBe("sub.example.com");
  });

  it("accepts hyphenated domains", () => {
    expect(validateDomain("my-site.example.com")).toBe("my-site.example.com");
  });

  it("rejects control characters", () => {
    expect(() => validateDomain("\x01evil.com")).toThrow(ValidationError);
    expect(() => validateDomain("evil\x00.com")).toThrow(ValidationError);
    expect(() => validateDomain("\nevil.com")).toThrow(ValidationError);
  });

  it("rejects path traversal", () => {
    expect(() => validateDomain("../../etc/passwd")).toThrow(ValidationError);
    expect(() => validateDomain("example.com/../secret")).toThrow(ValidationError);
  });

  it("rejects embedded query params", () => {
    expect(() => validateDomain("example.com?q=test")).toThrow(ValidationError);
    expect(() => validateDomain("example.com#anchor")).toThrow(ValidationError);
  });

  it("rejects URL-encoded sequences", () => {
    expect(() => validateDomain("exam%20ple.com")).toThrow(ValidationError);
    expect(() => validateDomain("%2e%2e/etc")).toThrow(ValidationError);
  });

  it("rejects empty input", () => {
    expect(() => validateDomain("")).toThrow(ValidationError);
  });

  it("rejects domains without TLD", () => {
    expect(() => validateDomain("localhost")).toThrow(ValidationError);
  });

  it("rejects domains exceeding max length", () => {
    const long = "a".repeat(250) + ".com";
    expect(() => validateDomain(long)).toThrow(ValidationError);
  });
});

describe("validateUrl", () => {
  it("accepts a full https URL", () => {
    expect(validateUrl("https://example.com")).toBe("https://example.com/");
  });

  it("accepts a full http URL", () => {
    expect(validateUrl("http://example.com")).toBe("http://example.com/");
  });

  it("prepends https:// to bare domains", () => {
    expect(validateUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves paths", () => {
    expect(validateUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("rejects control characters", () => {
    expect(() => validateUrl("\x01https://evil.com")).toThrow(ValidationError);
  });

  it("rejects path traversal", () => {
    expect(() => validateUrl("https://example.com/../../etc/passwd")).toThrow(ValidationError);
  });

  it("rejects invalid URLs", () => {
    expect(() => validateUrl("not a url at all")).toThrow(ValidationError);
  });
});

describe("validateCheckpointId", () => {
  it("accepts a stable id", () => {
    expect(validateCheckpointId("ia.a2a-agent-card")).toBe("ia.a2a-agent-card");
  });

  it("accepts a legacy id", () => {
    expect(validateCheckpointId("4.3")).toBe("4.3");
  });

  it("normalizes case and whitespace", () => {
    expect(validateCheckpointId(" IA.Robots-Txt ")).toBe("ia.robots-txt");
  });

  it.each(["", "ia.", "ia.bad_slug", "4", "4.3.1", "../4.3", "ia.x/../y", "ia.x?y"])("rejects %j", (id) => {
    expect(() => validateCheckpointId(id)).toThrow(ValidationError);
  });
});

describe("checkpoint filters", () => {
  it("normalizes a stage", () => {
    expect(validateStage("Read")).toBe("read");
  });

  it("rejects an unknown stage", () => {
    expect(() => validateStage("browse")).toThrow("Invalid stage: browse. Use find, read or act.");
  });

  it("normalizes a strength", () => {
    expect(validateStrength("should")).toBe("SHOULD");
  });

  it("rejects an unknown strength", () => {
    expect(() => validateStrength("COULD")).toThrow(ValidationError);
  });

  it("normalizes an AR practice id", () => {
    expect(validateArPractice("ar-find-01")).toBe("AR-FIND-01");
  });

  it("rejects a malformed AR practice id", () => {
    expect(() => validateArPractice("AR-FIND-1")).toThrow(ValidationError);
  });

  it("accepts a category slug", () => {
    expect(validateCategory("agent_protocols")).toBe("agent_protocols");
  });

  it("rejects a category with unsafe characters", () => {
    expect(() => validateCategory("agent&x=1")).toThrow(ValidationError);
  });

  it("accepts a methodology version date", () => {
    expect(validateMethodologyVersion("2026-09-02")).toBe("2026-09-02");
  });

  it("rejects a malformed methodology version", () => {
    expect(() => validateMethodologyVersion("latest")).toThrow(ValidationError);
  });
});
