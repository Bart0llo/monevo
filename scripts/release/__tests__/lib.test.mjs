import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  extractChangelogSection,
  imageRepository,
  isConventionalCommit,
  latestReleaseVersion,
  normalizeReleaseMode,
  parseGitHubRemote,
  parseMakefileHelp,
  parseVersion,
  releaseCommitSubject,
  tagForVersion,
  validateNextVersion,
  versionFromTag,
} from '../lib.mjs';

describe('versions and tags', () => {
  it('accepts only stable X.Y.Z versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.0.0')).toEqual([0, 0, 0]);
    for (const bad of ['1.2', '01.2.3', '1.2.3-rc.1', '1.2.3+build', 'v1.2.3', '', undefined]) {
      expect(parseVersion(bad)).toBeNull();
    }
  });

  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(() => compareVersions('1.2', '1.2.3')).toThrow();
  });

  it('maps versions to vX.Y.Z tags and back', () => {
    expect(tagForVersion('1.2.3')).toBe('v1.2.3');
    expect(versionFromTag('v1.2.3')).toBe('1.2.3');
    expect(versionFromTag('1.2.3')).toBeNull();
    expect(versionFromTag('v1.2.3-rc.1')).toBeNull();
    expect(() => tagForVersion('1.2.3-rc.1')).toThrow();
  });

  it('finds the latest release among unrelated tags', () => {
    expect(latestReleaseVersion(['v0.9.0', 'v0.10.0', 'v0.10.1-rc.1', 'backup', 'v0.2.0'])).toBe(
      '0.10.0',
    );
    expect(latestReleaseVersion([])).toBeNull();
  });
});

describe('validateNextVersion', () => {
  const base = { current: '1.2.3', latestReleased: '1.2.3', existingTags: ['v1.2.3'] };

  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
  ])('allows a %s increment', (_, next) => {
    expect(validateNextVersion({ ...base, next })).toEqual([]);
  });

  it('rejects the same or a lower version', () => {
    expect(validateNextVersion({ ...base, next: '1.2.3' }).join(' ')).toMatch(/not greater/);
    expect(validateNextVersion({ ...base, next: '1.2.2' }).join(' ')).toMatch(/not greater/);
  });

  it('rejects a version below the latest release even if package.json is behind', () => {
    const problems = validateNextVersion({
      next: '1.0.1',
      current: '1.0.0',
      latestReleased: '1.2.3',
      existingTags: ['v1.2.3'],
    });
    expect(problems.join(' ')).toMatch(/latest release 1\.2\.3/);
  });

  it('rejects an existing tag', () => {
    const problems = validateNextVersion({ ...base, next: '1.3.0', existingTags: ['v1.3.0'] });
    expect(problems).toEqual(['tag v1.3.0 already exists.']);
  });

  it('rejects pre-releases and malformed versions', () => {
    expect(validateNextVersion({ ...base, next: '1.3.0-rc.0' })[0]).toMatch(/not a stable/);
    expect(validateNextVersion({ ...base, next: 'v1.3.0' })[0]).toMatch(/not a stable/);
  });

  it('allows the first release from 0.0.0 without tags', () => {
    expect(
      validateNextVersion({
        next: '0.1.0',
        current: '0.0.0',
        latestReleased: null,
        existingTags: [],
      }),
    ).toEqual([]);
  });
});

describe('normalizeReleaseMode', () => {
  it('accepts the two supported modes, case-insensitively', () => {
    expect(normalizeReleaseMode('manual')).toMatchObject({ mode: 'manual', recognized: true });
    expect(normalizeReleaseMode(' GitHub-Actions ')).toMatchObject({
      mode: 'github-actions',
      recognized: true,
    });
  });

  it.each([undefined, '', '   ', 'auto', 'github', 'true'])(
    'falls back to manual for %j',
    (raw) => {
      expect(normalizeReleaseMode(raw)).toMatchObject({ mode: 'manual', recognized: false });
    },
  );
});

describe('image naming', () => {
  it('derives owner and repository from GitHub remotes', () => {
    for (const url of [
      'https://github.com/Some-Owner/monevo',
      'https://github.com/Some-Owner/monevo.git',
      'https://token@github.com/Some-Owner/monevo.git',
      'git@github.com:Some-Owner/monevo.git',
      'ssh://git@github.com/Some-Owner/monevo.git',
    ]) {
      expect(parseGitHubRemote(url)).toEqual({ owner: 'Some-Owner', repo: 'monevo' });
    }
    expect(parseGitHubRemote('https://gitlab.com/someone/monevo.git')).toBeNull();
    expect(parseGitHubRemote('')).toBeNull();
  });

  it('builds a lowercase registry path', () => {
    expect(imageRepository({ registry: 'ghcr.io', owner: 'Some-Owner', name: 'monevo' })).toBe(
      'ghcr.io/some-owner/monevo',
    );
    expect(() => imageRepository({ registry: 'ghcr.io', owner: '', name: 'monevo' })).toThrow();
  });
});

describe('commits and changelog', () => {
  it('formats the release commit subject', () => {
    expect(releaseCommitSubject('1.2.3')).toBe('chore(release): v1.2.3');
  });

  it('recognizes Conventional Commits', () => {
    expect(isConventionalCommit('feat(transactions): add quick entry')).toBe(true);
    expect(isConventionalCommit('fix!: drop legacy field')).toBe(true);
    expect(isConventionalCommit('docs: update releasing guide')).toBe(true);
    expect(isConventionalCommit("Merge remote-tracking branch 'origin/master'")).toBe(true);
    expect(isConventionalCommit('Redesign web shell with Passbook visual direction')).toBe(false);
    expect(isConventionalCommit('feat:missing space')).toBe(false);
  });

  const changelog = [
    '# Changelog',
    '',
    'Intro.',
    '',
    '## [1.1.0](https://example.test/compare/v1.0.0...v1.1.0) (2026-12-01)',
    '',
    '### Features',
    '',
    '* quick entry ([abc1234](https://example.test/commit/abc1234))',
    '',
    '## 1.0.0 (2026-11-20)',
    '',
    '### Bug Fixes',
    '',
    '* rounding',
    '',
  ].join('\n');

  it('extracts one version section including its subsections', () => {
    expect(extractChangelogSection(changelog, '1.1.0')).toBe(
      '### Features\n\n* quick entry ([abc1234](https://example.test/commit/abc1234))',
    );
    expect(extractChangelogSection(changelog, '1.0.0')).toBe('### Bug Fixes\n\n* rounding');
  });

  it('does not match a different version with the same prefix', () => {
    expect(extractChangelogSection(changelog, '1.1')).toBeNull();
    expect(extractChangelogSection(changelog, '0.1.0')).toBeNull();
  });
});

describe('Makefile help', () => {
  it('lists documented targets in order and skips everything else', () => {
    const makefile = [
      'RELEASE ?= manual ## not a target',
      '.PHONY: help version',
      'help: ## Show available commands',
      '\t@node cli.mjs help',
      'internal:',
      'release-notes: deps ## Preview the notes',
      'publish: ## Publish: manual = push; github-actions = instructions',
    ].join('\r\n'); // CRLF, as in a Windows checkout
    expect(parseMakefileHelp(makefile)).toEqual([
      { target: 'help', description: 'Show available commands' },
      { target: 'release-notes', description: 'Preview the notes' },
      { target: 'publish', description: 'Publish: manual = push; github-actions = instructions' },
    ]);
  });
});
