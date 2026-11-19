#!/usr/bin/env node
// Release and image tooling (docs/development/releasing.md). Called by the root Makefile, by the
// release-it hooks in .release-it.js, and by .github/workflows/release.yml.
// Node.js only (no jq, no shell-specific syntax), so it behaves the same on Linux, macOS and Windows.
//
//   node scripts/release/cli.mjs <command> [options]
//
//   help                    (make help) list the documented Makefile targets and variables
//   version                 print the canonical version (root package.json)
//   mode                    print the local publishing mode (RELEASE_MODE, default manual)
//   check [--validate] [--e2e]
//                           release prerequisites; optionally `pnpm validate` / `pnpm test:e2e`
//   next <version>          (release-it hook) the selected version may be released
//   after-release <version> (release-it hook) print what changed locally and the next steps
//   verify-tag <tag>        (GitHub Actions) the tag is a valid, prepared release at HEAD
//   notes [version]         print the CHANGELOG.md section of a released version
//   image <info|build|login|push|publish|inspect|remove|clean|assert-unpublished|github-release>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  DEFAULT_RELEASE_BRANCH,
  extractChangelogSection,
  imageRepository,
  isConventionalCommit,
  isValidVersion,
  latestReleaseVersion,
  normalizeReleaseMode,
  parseMakefileHelp,
  parseGitHubRemote,
  releaseCommitSubject,
  tagForVersion,
  validateNextVersion,
  versionFromTag,
} from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = process.env;
const REMOTE = env.RELEASE_REMOTE || 'origin';
const BRANCH = env.RELEASE_BRANCH || DEFAULT_RELEASE_BRANCH;

class UsageError extends Error {}

function fail(message) {
  throw new UsageError(message);
}

/** Runs a command. `capture` returns trimmed stdout; otherwise output is inherited. */
function run(command, args, { capture = false, allowFail = false, input } = {}) {
  // pnpm is a .cmd shim on Windows, which spawnSync can only start through a shell.
  const shell = process.platform === 'win32' && command === 'pnpm';
  if (!capture) console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell,
    encoding: 'utf8',
    input,
    stdio: capture || input !== undefined ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    if (allowFail) return { ok: false, stdout: '', stderr: String(result.error.message) };
    fail(`cannot run ${command}: ${result.error.message}`);
  }
  const out = {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
  if (!out.ok && !allowFail) {
    fail(
      `${command} ${args.join(' ')} exited with ${result.status}${out.stderr ? `: ${out.stderr}` : ''}`,
    );
  }
  return out;
}

const git = (...args) => run('git', args, { capture: true }).stdout;
const gitOk = (...args) => run('git', args, { capture: true, allowFail: true });

function rootVersion() {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return version;
}

function localTags() {
  return git('tag', '--list', 'v*').split('\n').filter(Boolean);
}

/** Release tags on the remote. Unreachable remote = failure: the check cannot be trusted offline. */
function remoteTags() {
  const result = gitOk('ls-remote', '--tags', '--refs', REMOTE, 'refs/tags/v*');
  if (!result.ok) fail(`cannot list tags on remote "${REMOTE}" (${result.stderr || 'no output'}).`);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1].replace('refs/tags/', ''));
}

function remoteBranchSha(branch) {
  const result = gitOk('ls-remote', '--heads', REMOTE, `refs/heads/${branch}`);
  if (!result.ok) fail(`cannot reach remote "${REMOTE}" (${result.stderr || 'no output'}).`);
  return result.stdout.split(/\s+/)[0] || null;
}

function localMode() {
  return normalizeReleaseMode(env.RELEASE_MODE);
}

async function confirm(question, flags) {
  if (flags.has('--yes') || env.YES === '1') return;
  if (!process.stdin.isTTY) fail(`${question} Not a terminal: re-run with YES=1 to confirm.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) fail('aborted, nothing was changed.');
}

function report(problems, warnings) {
  for (const warning of warnings) console.log(`  warning: ${warning}`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  if (problems.length) fail(`${problems.length} release prerequisite(s) failed.`);
}

// ─── Release preparation (Phase A) ────────────────────────────────────────────

function check(flags) {
  const problems = [];
  const warnings = [];
  const version = rootVersion();
  console.log(`Release prerequisites (branch ${BRANCH}, remote ${REMOTE})`);

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== BRANCH)
    problems.push(`current branch is "${branch}", releases are made from "${BRANCH}".`);

  const dirty = git('status', '--porcelain');
  if (dirty) problems.push('working tree is not clean (commit or stash changes first).');

  if (!isValidVersion(version)) problems.push(`package.json version "${version}" is not X.Y.Z.`);

  const local = localTags();
  const remote = remoteTags();
  const missingLocally = remote.filter((tag) => !local.includes(tag));
  if (missingLocally.length) {
    problems.push(
      `remote tags missing locally: ${missingLocally.join(', ')} (run: git fetch --tags).`,
    );
  }
  const unpushed = local.filter((tag) => versionFromTag(tag) && !remote.includes(tag));
  if (unpushed.length) {
    warnings.push(
      `local release tags not on ${REMOTE}: ${unpushed.join(', ')} (a prepared release is unpublished).`,
    );
  }

  const latest = latestReleaseVersion([...local, ...remote]);
  if (latest && isValidVersion(version)) {
    const cmp = compareVersions(version, latest);
    if (cmp < 0)
      problems.push(`package.json version ${version} is lower than the latest release ${latest}.`);
    if (cmp > 0) {
      problems.push(
        `package.json version ${version} has no tag but the latest release is ${latest}; the version must only be changed by release-it.`,
      );
    }
  }

  const head = git('rev-parse', 'HEAD');
  const upstream = remoteBranchSha(BRANCH);
  if (!upstream) {
    problems.push(`branch "${BRANCH}" does not exist on ${REMOTE}.`);
  } else if (upstream !== head && !gitOk('merge-base', '--is-ancestor', upstream, head).ok) {
    problems.push(`local "${BRANCH}" is behind or diverged from ${REMOTE}/${BRANCH} (pull first).`);
  }

  const range =
    latest && local.includes(tagForVersion(latest)) ? [`${tagForVersion(latest)}..HEAD`] : ['HEAD'];
  const subjects = git('log', '--format=%s', ...range)
    .split('\n')
    .filter(Boolean);
  if (!subjects.length)
    problems.push(`no commits since ${latest ? tagForVersion(latest) : 'the start'}.`);
  const unconventional = subjects.filter((subject) => !isConventionalCommit(subject));
  if (unconventional.length) {
    warnings.push(
      `${unconventional.length} of ${subjects.length} commit(s) since the last release do not follow Conventional Commits and will not appear in CHANGELOG.md:\n` +
        unconventional
          .slice(0, 10)
          .map((subject) => `      - ${subject}`)
          .join('\n') +
        (unconventional.length > 10 ? '\n      - …' : ''),
    );
  }

  console.log(
    `  version ${version}, latest release ${latest ?? 'none'}, ${subjects.length} commit(s) to release`,
  );
  report(problems, warnings);
  console.log('  ✓ git state and versions OK');

  if (flags.has('--validate')) run('pnpm', ['validate']);
  if (flags.has('--e2e')) run('pnpm', ['test:e2e']);
}

function next(version) {
  const current = rootVersion();
  const tags = [...new Set([...localTags(), ...remoteTags()])];
  const latestReleased = latestReleaseVersion(tags);
  const problems = validateNextVersion({
    next: version,
    current,
    latestReleased,
    existingTags: tags,
  });
  report(problems, []);
  console.log(`  ✓ ${tagForVersion(version)} is new and greater than ${latestReleased ?? current}`);
}

function afterRelease(version) {
  const tag = tagForVersion(version);
  const { mode } = localMode();
  console.log(`
Release ${tag} prepared locally:
  - package.json version is ${version}, CHANGELOG.md updated
  - commit "${releaseCommitSubject(version)}" and annotated tag ${tag} created
Nothing was pushed. Review with: git show ${tag}

Next (local RELEASE_MODE=${mode}; the GitHub repository variable decides remote behaviour):
  1. git push --atomic ${REMOTE} ${BRANCH} ${tag}
${
  mode === 'github-actions'
    ? '     With the repository variable RELEASE_MODE=github-actions this triggers the release workflow.'
    : `  2. make publish        (builds and pushes the image to the registry)\n  3. make github-release (creates the GitHub Release from CHANGELOG.md)`
}`);
}

// ─── Publishing checks ────────────────────────────────────────────────────────

/** GitHub Actions: the pushed tag is a release prepared by release-it, checked out at HEAD. */
function verifyTag(tag) {
  const problems = [];
  const version = versionFromTag(tag);
  if (!version) fail(`"${tag}" is not a vX.Y.Z release tag.`);

  const manifestVersion = rootVersion();
  if (manifestVersion !== version) {
    problems.push(`tag ${tag} does not match package.json version ${manifestVersion}.`);
  }
  if (gitOk('cat-file', '-t', `refs/tags/${tag}`).stdout !== 'tag') {
    problems.push(`${tag} is not an annotated tag (release-it creates annotated tags).`);
  }
  const commit = git('rev-list', '-n', '1', tag);
  if (commit !== git('rev-parse', 'HEAD')) problems.push(`HEAD is not the commit tagged ${tag}.`);

  const subject = git('log', '-1', '--format=%s', commit);
  if (subject !== releaseCommitSubject(version)) {
    problems.push(
      `tagged commit subject is "${subject}", expected "${releaseCommitSubject(version)}".`,
    );
  }
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).split('\n');
  for (const file of ['package.json', 'CHANGELOG.md']) {
    if (!files.includes(file)) problems.push(`release commit does not change ${file}.`);
  }
  const parent = gitOk('show', `${commit}^:package.json`);
  const previous = parent.ok ? JSON.parse(parent.stdout).version : null;
  if (!isValidVersion(previous) || compareVersions(version, previous) <= 0) {
    problems.push(
      `release commit does not increase the version (previous: ${previous ?? 'unknown'}).`,
    );
  }
  const latest = latestReleaseVersion(localTags());
  if (latest && compareVersions(version, latest) < 0) {
    problems.push(
      `${tag} is older than the latest release v${latest}; "latest" would move backwards.`,
    );
  }
  if (!gitOk('merge-base', '--is-ancestor', commit, `refs/remotes/${REMOTE}/${BRANCH}`).ok) {
    problems.push(`${tag} is not on ${REMOTE}/${BRANCH} (push the branch together with the tag).`);
  }
  report(problems, []);
  console.log(`  ✓ ${tag} is a valid release commit (${commit.slice(0, 12)})`);
}

function changelogNotes(version) {
  const markdown = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const section = extractChangelogSection(markdown, version);
  if (section === null) fail(`CHANGELOG.md has no section for ${version}.`);
  return section || '_No user-facing changes recorded._';
}

// ─── Docker image (Phase B) ───────────────────────────────────────────────────

function imageContext() {
  const remoteUrl = gitOk('remote', 'get-url', REMOTE).stdout;
  const github = parseGitHubRemote(remoteUrl);
  const owner = env.IMAGE_OWNER || github?.owner;
  if (!owner)
    fail(
      `cannot derive the GitHub owner from "${REMOTE}" (${remoteUrl || 'none'}); set IMAGE_OWNER.`,
    );
  const version = rootVersion();
  const repository = imageRepository({
    registry: env.IMAGE_REGISTRY || 'ghcr.io',
    owner,
    name: env.IMAGE_NAME || 'monevo',
  });
  const tag = tagForVersion(version);
  return {
    registry: repository.split('/')[0],
    owner: owner.toLowerCase(),
    repository,
    version,
    tag,
    versioned: `${repository}:${tag}`,
    latest: `${repository}:latest`,
    sourceUrl:
      env.IMAGE_SOURCE_URL || (github ? `https://github.com/${github.owner}/${github.repo}` : ''),
    platforms: env.IMAGE_PLATFORMS || 'linux/amd64,linux/arm64',
  };
}

/** Images are built only from a clean checkout of the release tag, so `vX.Y.Z` always means that commit. */
function requireReleaseCheckout(ctx) {
  const tagCommit = gitOk('rev-list', '-n', '1', ctx.tag);
  if (!tagCommit.ok)
    fail(`tag ${ctx.tag} does not exist; prepare the release with \`make release\` first.`);
  const head = git('rev-parse', 'HEAD');
  if (tagCommit.stdout !== head)
    fail(`HEAD is not ${ctx.tag}; check out the release tag (git switch --detach ${ctx.tag}).`);
  if (git('status', '--porcelain'))
    fail('working tree is not clean; release images are built from committed files only.');
  return head;
}

function buildArgs(ctx, revision) {
  return [
    '--build-arg',
    `APP_VERSION=${ctx.version}`,
    '--build-arg',
    `GIT_COMMIT=${revision}`,
    '--build-arg',
    `BUILD_DATE=${new Date().toISOString()}`,
    '--build-arg',
    `SOURCE_URL=${ctx.sourceUrl}`,
    '--tag',
    ctx.versioned,
    '--tag',
    ctx.latest,
  ];
}

/** Refuses to overwrite an immutable version tag in the registry. */
function assertUnpublished(ref) {
  const result = run('docker', ['buildx', 'imagetools', 'inspect', ref], {
    capture: true,
    allowFail: true,
  });
  if (result.ok) fail(`${ref} already exists in the registry; version tags are never overwritten.`);
  if (!/not found|manifest unknown|name unknown|404/i.test(result.stderr)) {
    fail(
      `cannot verify that ${ref} is unpublished (${result.stderr || 'unknown error'}). Run \`make login\` first.`,
    );
  }
  console.log(`  ✓ ${ref} is not published yet`);
}

function printInfo(ctx) {
  const { mode, recognized, raw } = localMode();
  console.log(`version      ${ctx.version}
image        ${ctx.versioned}
             ${ctx.latest}
registry     ${ctx.registry} (owner ${ctx.owner})
source       ${ctx.sourceUrl || '(unknown)'}
platforms    ${ctx.platforms} (make publish; make build/push use the host platform)
local mode   ${mode}${!recognized && raw ? ` (invalid value "${raw}" ignored)` : ''}`);
}

function imageBuild(ctx) {
  const revision = requireReleaseCheckout(ctx);
  run('docker', ['buildx', 'build', '--load', ...buildArgs(ctx, revision), '.']);
  console.log(
    `\nbuilt ${ctx.versioned} and ${ctx.latest} for the host platform (inspect: make inspect)`,
  );
}

function imageLogin(ctx) {
  const user = env.GHCR_USERNAME || ctx.owner;
  if (env.GHCR_TOKEN) {
    run('docker', ['login', ctx.registry, '--username', user, '--password-stdin'], {
      input: env.GHCR_TOKEN,
    });
    console.log(`logged in to ${ctx.registry} as ${user}`);
  } else {
    console.log(
      `GHCR_TOKEN is not set: docker asks for a token (classic PAT with write:packages).`,
    );
    run('docker', ['login', ctx.registry, '--username', user]);
  }
}

async function imagePush(ctx, flags) {
  const revision = requireReleaseCheckout(ctx);
  const local = run('docker', ['image', 'inspect', ctx.versioned], {
    capture: true,
    allowFail: true,
  });
  if (!local.ok) fail(`${ctx.versioned} is not built locally; run \`make build\` first.`);
  const labels = JSON.parse(local.stdout)[0]?.Config?.Labels ?? {};
  if (labels['org.opencontainers.image.revision'] !== revision) {
    fail(`local ${ctx.versioned} was not built from ${ctx.tag}; rebuild with \`make build\`.`);
  }
  assertUnpublished(ctx.versioned);
  await confirm(`Push ${ctx.versioned} and ${ctx.latest} (host platform only)?`, flags);
  run('docker', ['push', ctx.versioned]);
  run('docker', ['push', ctx.latest]);
}

async function imagePublish(ctx, flags) {
  const { mode, recognized, raw } = localMode();
  if (!recognized && raw) console.log(`warning: RELEASE_MODE="${raw}" is invalid, using manual.`);
  const tagOnRemote = remoteTags().includes(ctx.tag);
  if (mode === 'github-actions') {
    console.log(`Local RELEASE_MODE=github-actions: nothing is published from this machine.
GitHub Actions publishes ${ctx.tag} when the tag is pushed and the repository variable RELEASE_MODE
is "github-actions" (Settings → Secrets and variables → Actions → Variables).
${
  tagOnRemote
    ? `${ctx.tag} is already on ${REMOTE}; check the "Release" workflow run.`
    : `Push it yourself when ready:  git push --atomic ${REMOTE} ${BRANCH} ${ctx.tag}`
}`);
    return;
  }
  const revision = requireReleaseCheckout(ctx);
  assertUnpublished(ctx.versioned);
  await confirm(`Build ${ctx.platforms} and push ${ctx.versioned} and ${ctx.latest}?`, flags);
  run('docker', [
    'buildx',
    'build',
    '--platform',
    ctx.platforms,
    '--push',
    ...buildArgs(ctx, revision),
    '.',
  ]);
  console.log(`\npublished ${ctx.versioned} and ${ctx.latest}
Next: ${tagOnRemote ? '' : `git push --atomic ${REMOTE} ${BRANCH} ${ctx.tag}, then `}make github-release`);
}

async function githubRelease(ctx, flags) {
  if (localMode().mode === 'github-actions') {
    fail('local RELEASE_MODE=github-actions: the release workflow creates the GitHub Release.');
  }
  if (!remoteTags().includes(ctx.tag)) {
    fail(
      `${ctx.tag} is not on ${REMOTE}; push it first (git push --atomic ${REMOTE} ${BRANCH} ${ctx.tag}).`,
    );
  }
  if (!run('gh', ['--version'], { capture: true, allowFail: true }).ok) {
    fail(
      `GitHub CLI (gh) not found. Create the release in the web UI from tag ${ctx.tag} and paste \`make release-notes VERSION=${ctx.version}\`.`,
    );
  }
  if (run('gh', ['release', 'view', ctx.tag], { capture: true, allowFail: true }).ok) {
    fail(`GitHub Release ${ctx.tag} already exists.`);
  }
  await confirm(`Create GitHub Release ${ctx.tag}?`, flags);
  const dir = mkdtempSync(join(tmpdir(), 'monevo-release-'));
  try {
    const file = join(dir, 'notes.md');
    writeFileSync(file, `${changelogNotes(ctx.version)}\n\nImage: \`${ctx.versioned}\`\n`);
    // --verify-tag: never let gh create (and push) a tag that does not exist on the remote.
    run('gh', [
      'release',
      'create',
      ctx.tag,
      '--verify-tag',
      '--title',
      ctx.tag,
      '--notes-file',
      file,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function imageInspect(ctx) {
  const ref = env.IMAGE_REF || ctx.versioned;
  const result = run('docker', ['image', 'inspect', ref], { capture: true, allowFail: true });
  if (!result.ok) fail(`${ref} is not present locally (make build).`);
  const [image] = JSON.parse(result.stdout);
  const labels = image.Config?.Labels ?? {};
  console.log(`image     ${ref}
id        ${image.Id}
tags      ${(image.RepoTags ?? []).join(', ')}
platform  ${image.Os}/${image.Architecture}
size      ${(image.Size / 1024 / 1024).toFixed(1)} MiB
labels`);
  for (const key of Object.keys(labels).sort()) console.log(`  ${key}=${labels[key]}`);
}

async function imageRemove(ctx, flags) {
  const list = run(
    'docker',
    ['image', 'ls', ctx.repository, '--format', '{{.Repository}}:{{.Tag}} {{.ID}}'],
    {
      capture: true,
    },
  ).stdout;
  const refs = list
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref, id] = line.split(' ');
      return ref.endsWith(':<none>') ? id : ref;
    });
  if (!refs.length) {
    console.log(`no local ${ctx.repository} images`);
    return;
  }
  console.log(refs.map((ref) => `  ${ref}`).join('\n'));
  await confirm(
    `Remove these ${refs.length} local image(s)? Registry images are not touched.`,
    flags,
  );
  run('docker', ['image', 'rm', ...new Set(refs)]);
}

// ─── Make help ───────────────────────────────────────────────────────────────

/** `make help` in Node.js, so it needs no awk or Unix shell (Windows PowerShell). */
function printMakeHelp() {
  const targets = parseMakefileHelp(readFileSync(join(ROOT, 'Makefile'), 'utf8'));
  console.log('Monevo release commands (docs/development/releasing.md)\n');
  for (const { target, description } of targets) {
    console.log(`  make ${target.padEnd(16)} ${description}`);
  }
  console.log(
    `\nVariables: RELEASE_MODE=${env.RELEASE_MODE || 'manual'} IMAGE_REGISTRY=${env.IMAGE_REGISTRY || 'ghcr.io'} ` +
      `IMAGE_OWNER=${env.IMAGE_OWNER || '<from origin>'} IMAGE_NAME=${env.IMAGE_NAME || 'monevo'}`,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
  const [arg] = rest.filter((value) => !value.startsWith('--'));

  switch (command) {
    case 'help':
      return printMakeHelp();
    case 'version':
      return console.log(rootVersion());
    case 'mode': {
      const { mode, recognized, raw } = localMode();
      console.log(mode);
      if (!recognized && raw)
        console.error(`warning: RELEASE_MODE="${raw}" is invalid, using ${mode}.`);
      return undefined;
    }
    case 'check':
      return check(flags);
    case 'next':
      return next(arg ?? fail('usage: next <version>'));
    case 'after-release':
      return afterRelease(arg ?? fail('usage: after-release <version>'));
    case 'verify-tag':
      return verifyTag(arg ?? fail('usage: verify-tag <tag>'));
    case 'notes':
      return console.log(changelogNotes(arg ?? rootVersion()));
    case 'image': {
      const ctx = imageContext();
      const action = {
        info: () => printInfo(ctx),
        build: () => imageBuild(ctx),
        login: () => imageLogin(ctx),
        push: () => imagePush(ctx, flags),
        publish: () => imagePublish(ctx, flags),
        inspect: () => imageInspect(ctx),
        remove: () => imageRemove(ctx, flags),
        clean: () => run('docker', ['builder', 'prune']),
        'assert-unpublished': () => assertUnpublished(ctx.versioned),
        'github-release': () => githubRelease(ctx, flags),
      }[arg];
      if (!action) fail(`unknown image action "${arg ?? ''}"`);
      return action();
    }
    default:
      fail(`unknown command "${command ?? ''}" (see the header of scripts/release/cli.mjs)`);
  }
  return undefined;
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`\nrelease: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
