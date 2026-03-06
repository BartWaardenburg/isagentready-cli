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
    throw new ValidationError("Domain contains query parameters — pass a clean domain");
  }
  if (URL_ENCODED.test(input)) {
    throw new ValidationError("Domain contains URL-encoded sequences — pass a decoded domain");
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
