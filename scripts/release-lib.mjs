// Pure helpers for scripts/release.mjs. No I/O, so the tests can cover them.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const UNRELEASED = "## Unreleased";

const parse = (version) => {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`"${version}" is not a x.y.z version.`);
  return match.slice(1).map(Number);
};

const isHigher = (next, current) => {
  const a = parse(next);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};

/**
 * Returns the next version for a bump spec: patch, minor, major or an explicit x.y.z.
 * @param {string} current
 * @param {string} spec
 * @returns {string}
 */
export const bumpVersion = (current, spec) => {
  const [major, minor, patch] = parse(current);
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "major") return `${major + 1}.0.0`;
  if (!SEMVER.test(spec)) throw new Error(`Use patch, minor, major or x.y.z, not "${spec}".`);
  if (!isHigher(spec, current)) throw new Error(`${spec} is not higher than ${current}.`);
  return spec;
};

/**
 * Moves the notes under "## Unreleased" to a new version entry and adds an empty Unreleased section.
 * @param {string} text
 * @param {{ version: string, previous: string, date: string, repoUrl: string }} release
 * @returns {string}
 */
export const releaseChangelog = (text, { version, previous, date, repoUrl }) => {
  const start = text.indexOf(`${UNRELEASED}\n`);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" section.`);
  const bodyStart = start + UNRELEASED.length + 1;
  const next = text.slice(bodyStart).search(/^#{1,2} \[/m);
  const body = next === -1 ? text.slice(bodyStart) : text.slice(bodyStart, bodyStart + next);
  if (body.trim() === "") throw new Error(`The "${UNRELEASED}" section has no notes. Write them first.`);
  const heading = `## [${version}](${repoUrl}/compare/v${previous}...v${version}) (${date})`;
  return `${text.slice(0, start)}${UNRELEASED}\n\n${heading}\n${text.slice(bodyStart)}`;
};

/**
 * Returns the notes of one version entry, without its heading.
 * @param {string} text
 * @param {string} version
 * @returns {string}
 */
export const releaseNotes = (text, version) => {
  const escaped = version.replace(/\./g, "\\.");
  const heading = new RegExp(`^#{1,2} \\[${escaped}\\].*$`, "m");
  const match = heading.exec(text);
  if (!match) throw new Error(`CHANGELOG.md has no entry for ${version}.`);
  const rest = text.slice(match.index + match[0].length);
  const end = rest.search(/^#{1,2} (\[|Unreleased)/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
};

/**
 * Sets the top-level "version" field and keeps the rest of package.json as it is.
 * @param {string} text
 * @param {string} version
 * @returns {string}
 */
export const setPackageVersion = (text, version) =>
  text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
