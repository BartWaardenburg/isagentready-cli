import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const compiler = join(root, "node_modules/typescript/bin/tsc");

// Exercise the public package entry and declarations from outside the source tree.
describe("packed SDK", () => {
  it("imports without CLI side effects and has usable external TypeScript declarations", () => {
    const temporary = mkdtempSync(join(tmpdir(), "isagentready-sdk-"));
    try {
      execFileSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
        cwd: root,
        stdio: "pipe",
      });
      const packed = JSON.parse(
        execFileSync(
          "npm",
          ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
          { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      const consumer = join(temporary, "consumer");
      const installed = join(consumer, "node_modules/isagentready");
      mkdirSync(installed, { recursive: true });
      execFileSync("tar", [
        "-xzf",
        join(temporary, packed[0].filename),
        "-C",
        installed,
        "--strip-components=1",
      ]);
      writeFileSync(
        join(consumer, "probe.mjs"),
        `
import assert from "node:assert/strict";
import { createClient } from "isagentready/sdk";
const client = createClient({ fetch: async () => new Response(JSON.stringify({ version: "2026-10-30", checkpoints: [] })) });
const result = await client.getMethodology();
assert.equal(result.ok, true);
assert.equal(result.data.version, "2026-10-30");
console.log("sdk-import-ok");
`,
      );
      expect(
        execFileSync(process.execPath, [join(consumer, "probe.mjs")], {
          cwd: consumer,
          encoding: "utf8",
        }),
      ).toBe("sdk-import-ok\n");
      writeFileSync(
        join(consumer, "probe.mts"),
        `
import { createClient, type Result } from "isagentready/sdk";
const client = createClient();
const read = async (): Promise<void> => {
  const result = await client.getScanResults("example.com");
  if (result.ok) {
    const score: number | null | undefined = result.data.overall_score;
    const conformance: "not_verified" | undefined = result.data.ar_assessment?.conformance;
    void score; void conformance;
  } else {
    const status: number | null = result.error.status;
    void status;
  }
};
void read;
const value: Result<string> = { ok: true, data: "typed" };
void value;
`,
      );
      writeFileSync(
        join(consumer, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            lib: ["ES2022", "DOM"],
            strict: true,
            types: [],
            noEmit: true,
          },
          include: ["probe.mts"],
        }),
      );
      expect(
        execFileSync(process.execPath, [compiler, "-p", join(consumer, "tsconfig.json")], {
          cwd: consumer,
          encoding: "utf8",
        }),
      ).toBe("");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }, 30_000);
});
