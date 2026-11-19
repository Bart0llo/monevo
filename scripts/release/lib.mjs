// Pure helpers for the release tooling (docs/development/releasing.md).
// No I/O here, so every rule is unit-tested in scripts/release/__tests__.

/** Release tags are exactly `vX.Y.Z` (stable SemVer, no pre-release or build metadata). */
export const TAG_PREFIX = 'v';
export const RELEASE_MODES = /** @type {const} */ (['manual', 'github-actions']);
export const DEFAULT_RELEASE_MODE = 'manual';
export const DEFAULT_RELEASE_BRANCH = 'master';
export const RELEASE_COMMIT_PREFIX = 'chore(release): ';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** @returns {[number, number, number] | null} */
export function parseVersion(value) {
  const match = SEMVER.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isValidVersion(value) {
  return parseVersion(value) !== null;
}

/** Negative if a < b, 0 if equal, positive if a > b. Both must be valid. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`cannot compare invalid versions "${a}" and "${b}"`);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function tagForVersion(version) {
  if (!isValidVersion(version)) throw new Error(`invalid version "${version}"`);
  return `${TAG_PREFIX}${version}`;
}

/** `v1.2.3` → `1.2.3`; anything else → null. */
export function versionFromTag(tag) {
  const value = String(tag ?? '').trim();
  if (!value.startsWith(TAG_PREFIX)) return null;
  const version = value.slice(TAG_PREFIX.length);
  return isValidVersion(version) ? version : null;
}

/** Highest `vX.Y.Z` tag in a list (other tags are ignored), or null. */
export function latestReleaseVersion(tags) {
  let latest = null;
  for (const tag of tags) {
    const version = versionFromTag(tag);
    if (version && (latest === null || compareVersions(version, latest) > 0)) latest = version;
  }
  return latest;
}

/**
 * Publishing mode from `RELEASE_MODE`. Missing, empty, or unknown values fall back to `manual`,
 * so nothing is ever published automatically by accident.
 */
export function normalizeReleaseMode(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  const recognized = RELEASE_MODES.includes(value);
  return { mode: recognized ? value : DEFAULT_RELEASE_MODE, recognized, raw: String(raw ?? '') };
}

/**
 * Checks a version proposed by release-it against the released history.
 * @returns {string[]} problems (empty when the version may be released)
 */
export function validateNextVersion({ next, current, latestReleased, existingTags }) {
  const problems = [];
  if (!isValidVersion(next)) {
    problems.push(
      `"${next}" is not a stable X.Y.Z version (pre-releases and build metadata are not released).`,
    );
    return problems;
  }
  if (isValidVersion(current) && compareVersions(next, current) <= 0) {
    problems.push(`next version ${next} is not greater than the current version ${current}.`);
  }
  if (latestReleased && compareVersions(next, latestReleased) <= 0) {
    problems.push(`next version ${next} is not greater than the latest release ${latestReleased}.`);
  }
  const tag = tagForVersion(next);
  if (existingTags.includes(tag)) problems.push(`tag ${tag} already exists.`);
  return problems;
}

/** Owner of a GitHub remote URL (https, ssh or scp-like), lowercased for GHCR; else null. */
export function parseGitHubRemote(url) {
  const value = String(url ?? '').trim();
  const match =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(
      value,
    );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/** `ghcr.io/<owner>/monevo`; registry paths must be lowercase. */
export function imageRepository({ registry, owner, name }) {
  for (const [key, part] of Object.entries({ registry, owner, name })) {
    if (!part || /\s/.test(part)) throw new Error(`image ${key} is empty or contains whitespace`);
  }
  return `${registry}/${owner}/${name}`.toLowerCase();
}

/** The release commit subject release-it creates (`git.commitMessage` in .release-it.js). */
export function releaseCommitSubject(version) {
  return `${RELEASE_COMMIT_PREFIX}${tagForVersion(version)}`;
}

const CONVENTIONAL = /^(?:[a-z]+)(?:\([\w./,-]+\))?!?: \S/;

/** True for `type(scope)!: subject`; merge commits count as conventional (they never appear in notes). */
export function isConventionalCommit(subject) {
  const value = String(subject ?? '');
  return (
    CONVENTIONAL.test(value) || /^Merge (?:branch|pull request|remote-tracking branch) /.test(value)
  );
}

/**
 * Body of the CHANGELOG.md section for `version` (without its heading), or null.
 * Sections start with `## ` or `### ` headings that contain the version, as conventional-changelog writes them.
 */
export function extractChangelogSection(markdown, version) {
  const lines = String(markdown).split(/\r?\n/);
  const escaped = version.replace(/\./g, '\\.');
  const heading = new RegExp(`^#{2,3} \\[?v?${escaped}\\]?(?:[ (]|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,3} \[?v?\d+\.\d+\.\d+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/**
 * Documented Makefile targets: lines like `target: deps ## description`, in file order.
 * Used by `make help`, so it needs no awk/grep (Windows without Git Bash).
 */
export function parseMakefileHelp(makefile) {
  const targets = [];
  for (const line of String(makefile).split(/\r?\n/)) {
    const match = /^([a-z][a-z-]*):[^=]*?## (.+)$/.exec(line);
    if (match) targets.push({ target: match[1], description: match[2].trim() });
  }
  return targets;
}
