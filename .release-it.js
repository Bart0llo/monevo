// release-it configuration: Phase A of every Monevo release (docs/development/releasing.md).
// It runs the same way whatever the publishing mode is: check prerequisites, choose the next
// version interactively, bump package.json, update CHANGELOG.md, then create the release commit and
// the annotated tag vX.Y.Z locally. It never pushes, never publishes to npm, and never creates a
// GitHub Release; publishing (Phase B) is a separate, explicit step (manual or GitHub Actions).

// `release-it --changelog` (make release-notes) and `--release-version` only preview: they run the
// init lifecycle too, so skip the slow validation and the clean-tree/branch requirements for them.
const previewOnly = process.argv.some(
  (arg) => arg === '--changelog' || arg === '--release-version',
);
const cli = 'node scripts/release/cli.mjs';

export default {
  hooks: previewOnly
    ? {}
    : {
        // Branch, clean tree, version/tag consistency, local and remote tags, upstream, then `pnpm validate`.
        'before:init': `${cli} check --validate`,
        // The selected version is stable X.Y.Z, greater than every release, and its tag is unused
        // locally and on the remote. Runs before any file is modified.
        'before:bump': `${cli} next \${version}`,
        'after:release': `${cli} after-release \${version}`,
      },

  git: {
    requireBranch: previewOnly ? false : 'master',
    requireCleanWorkingDir: !previewOnly,
    requireUpstream: !previewOnly,
    // No empty releases.
    requireCommits: !previewOnly,
    commit: true,
    commitMessage: 'chore(release): v${version}',
    tag: true,
    tagName: 'v${version}',
    tagAnnotation: 'Release v${version}',
    // Only stable vX.Y.Z tags count as releases.
    tagMatch: 'v[0-9]*.[0-9]*.[0-9]*',
    // Pushing is a separate, explicit step (git push --atomic origin master vX.Y.Z).
    push: false,
  },

  // The root package.json `version` is the canonical application version. The npm plugin only
  // bumps it (`npm version --no-git-tag-version`); the package is private and never published.
  npm: {
    publish: false,
    allowSameVersion: false,
  },

  // GitHub Releases are created by `make github-release` (manual mode) or by
  // .github/workflows/release.yml (github-actions mode), never here, so there is exactly one.
  github: { release: false },
  gitlab: { release: false },

  plugins: {
    '@release-it/conventional-changelog': {
      infile: 'CHANGELOG.md',
      // Single line on purpose: the plugin strips the header from the previous file content before
      // prepending the new section, and a multi-line header would be joined with the OS line ending
      // (CRLF on Windows) and never match the LF file, duplicating it.
      header: '# Changelog',
      preset: {
        name: 'conventionalcommits',
        // `effect`: bump/changelog = listed in CHANGELOG.md, hidden = omitted. Commits that do not
        // follow Conventional Commits are omitted too (`make release-check` lists them).
        types: [
          { type: 'feat', section: 'Features', effect: 'bump' },
          { type: 'fix', section: 'Bug Fixes', effect: 'bump' },
          { type: 'perf', section: 'Performance', effect: 'bump' },
          { type: 'revert', section: 'Reverts', effect: 'bump' },
          { type: 'docs', section: 'Documentation', effect: 'changelog' },
          { type: 'build', section: 'Build and Dependencies', effect: 'changelog' },
          { type: 'refactor', effect: 'hidden' },
          { type: 'test', effect: 'hidden' },
          { type: 'style', effect: 'hidden' },
          { type: 'ci', effect: 'hidden' },
          { type: 'chore', effect: 'hidden' },
        ],
      },
      // Always offer the patch/minor/major prompt instead of an automatic recommendation, because
      // the history before the first release does not follow Conventional Commits.
      ignoreRecommendedBump: true,
    },
  },
};
