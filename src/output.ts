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

/** A node is `true` when the full value is kept, or a map of child keys. */
type MaskTree = true | Map<string, MaskTree>;

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const addPath = (tree: Map<string, MaskTree>, segments: string[]): void => {
  const [head, ...rest] = segments;
  if (!head || UNSAFE_KEYS.has(head)) return;

  const current = tree.get(head);
  if (current === true) return;
  if (rest.length === 0) {
    tree.set(head, true);
    return;
  }

  const child = current ?? new Map<string, MaskTree>();
  tree.set(head, child);
  addPath(child, rest);
};

const buildMaskTree = (fields: string): Map<string, MaskTree> => {
  const tree = new Map<string, MaskTree>();
  for (const field of fields.split(",")) {
    addPath(tree, field.trim().split(".").map((segment) => segment.trim()));
  }
  return tree;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Returns undefined when the path does not exist in the value. */
const project = (value: unknown, tree: MaskTree): unknown => {
  if (tree === true) return value;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => project(item, tree));
  if (!isPlainObject(value)) return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, subtree] of tree) {
    if (!Object.hasOwn(value, key)) continue;
    const projected = project(value[key], subtree);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
};

/**
 * Keeps only the listed fields. A field can be a dot path such as
 * `categories.checkpoints.status`. A path step into an array applies the
 * rest of the path to each element.
 */
export const applyFieldMask = (data: unknown, fields?: string): unknown => {
  if (!fields) return data;
  return project(data, buildMaskTree(fields)) ?? {};
};
