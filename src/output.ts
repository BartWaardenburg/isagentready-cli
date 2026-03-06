export type OutputFormat = "json" | "text";

export const resolveOutputFormat = (options: {
  json?: boolean;
  output?: string;
}): OutputFormat => {
  if (options.json) return "json";
  if (options.output === "json") return "json";
  if (options.output === "text") return "text";

  const envFormat = process.env["OUTPUT_FORMAT"];
  if (envFormat === "json") return "json";

  if (!process.stdout.isTTY) return "json";

  return "text";
};

export const isJsonMode = (options: { json?: boolean; output?: string }): boolean =>
  resolveOutputFormat(options) === "json";

export const applyFieldMask = <T extends Record<string, unknown>>(
  data: T,
  fields?: string
): Partial<T> | T => {
  if (!fields) return data;

  const allowed = new Set(fields.split(",").map((f) => f.trim()));
  const filtered: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in data) {
      filtered[key] = data[key];
    }
  }

  return filtered as Partial<T>;
};
