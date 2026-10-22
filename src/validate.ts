const CONTROL_CHARS = /[\x00-\x1f]/;
const PATH_TRAVERSAL = /\.\.\//;
const EMBEDDED_QUERY = /[?#]/;
const URL_ENCODED = /%[0-9a-fA-F]{2}/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const validateDomain = (input: string): string => {
  if (CONTROL_CHARS.test(input)) {
    throw new ValidationError("Domain contains control characters");
  }
  if (PATH_TRAVERSAL.test(input)) {
    throw new ValidationError("Domain contains path traversal sequences");
  }
  if (EMBEDDED_QUERY.test(input)) {
    throw new ValidationError("Domain contains query parameters. Pass a clean domain.");
  }
  if (URL_ENCODED.test(input)) {
    throw new ValidationError("Domain contains URL-encoded sequences. Pass a decoded domain.");
  }

  const cleaned = input
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase()
    .trim();

  if (!cleaned || cleaned.length > 253) {
    throw new ValidationError("Invalid domain");
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(cleaned)) {
    throw new ValidationError(`Invalid domain format: ${cleaned}`);
  }

  return cleaned;
};

export const validateUrl = (input: string): string => {
  if (CONTROL_CHARS.test(input)) {
    throw new ValidationError("URL contains control characters");
  }
  if (PATH_TRAVERSAL.test(input)) {
    throw new ValidationError("URL contains path traversal sequences");
  }

  const url = input.startsWith("http") ? input : `https://${input}`;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new ValidationError("URL must use http:// or https://");
    }
    return parsed.toString();
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Invalid URL: ${input}`);
  }
};

const STABLE_ID = /^ia\.[a-z0-9]+(-[a-z0-9]+)*$/;
const LEGACY_ID = /^\d{1,2}\.\d{1,2}$/;
const STAGES = ["find", "read", "act"] as const;
const STRENGTHS = ["MUST", "SHOULD", "MAY"] as const;
const AR_PRACTICE = /^AR-(FIND|READ|ACT)-\d{2}$/;
const CATEGORY = /^[a-z][a-z0-9_]{0,63}$/;
const METHODOLOGY_VERSION = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts a stable id (`ia.<slug>`) or a legacy id (`4.3`). */
export const validateCheckpointId = (input: string): string => {
  const id = input.trim().toLowerCase();
  if (STABLE_ID.test(id) || LEGACY_ID.test(id)) return id;
  throw new ValidationError(
    `Invalid checkpoint id: ${input}. Use a stable id such as ia.robots-txt or a legacy id such as 1.1.`
  );
};

export const validateStage = (input: string): string => {
  const stage = input.trim().toLowerCase();
  if ((STAGES as readonly string[]).includes(stage)) return stage;
  throw new ValidationError(`Invalid stage: ${input}. Use find, read or act.`);
};

export const validateStrength = (input: string): string => {
  const strength = input.trim().toUpperCase();
  if ((STRENGTHS as readonly string[]).includes(strength)) return strength;
  throw new ValidationError(`Invalid strength: ${input}. Use MUST, SHOULD or MAY.`);
};

export const validateArPractice = (input: string): string => {
  const id = input.trim().toUpperCase();
  if (AR_PRACTICE.test(id)) return id;
  throw new ValidationError(`Invalid AR practice id: ${input}. Use the form AR-FIND-01.`);
};

export const validateCategory = (input: string): string => {
  const category = input.trim().toLowerCase();
  if (CATEGORY.test(category)) return category;
  throw new ValidationError(`Invalid category: ${input}. Use a category key such as agent_protocols.`);
};

export const validateMethodologyVersion = (input: string): string => {
  const version = input.trim();
  if (METHODOLOGY_VERSION.test(version)) return version;
  throw new ValidationError(`Invalid methodology version: ${input}. Use a date such as 2026-09-02.`);
};
