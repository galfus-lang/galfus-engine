import { describe, expect, test } from 'bun:test';
import { parseReleaseBranch, selectBranchesToDelete } from './cleanup-release-branches';

describe('parseReleaseBranch', () => {
  test('parses valid release branches across supported channels', () => {
    expect(parseReleaseBranch('alpha/v0.22.3')).toEqual({
      name: 'alpha/v0.22.3',
      channel: 'alpha',
      major: 0,
      minor: 22,
      patch: 3
    });
    expect(parseReleaseBranch('beta/v1.12.100')).toEqual({
      name: 'beta/v1.12.100',
      channel: 'beta',
      major: 1,
      minor: 12,
      patch: 100
    });
    expect(parseReleaseBranch('stable/v2.0.0')).not.toBeNull();
    expect(parseReleaseBranch('next/v0.0.1')).not.toBeNull();
  });

  test('ignores unsupported channels and non-release branches', () => {
    expect(parseReleaseBranch('main')).toBeNull();
    expect(parseReleaseBranch('feat/cleanup')).toBeNull();
    expect(parseReleaseBranch('latest/v1.0.0')).toBeNull();
    expect(parseReleaseBranch('beta/v1.2')).toBeNull();
    expect(parseReleaseBranch('beta/1.2.3')).toBeNull();
  });
});

describe('selectBranchesToDelete', () => {
  test('keeps only the 5 newest patches in a major.minor group', () => {
    const branches = Array.from({ length: 10 }, (_, patch) => `beta/v0.1.${patch}`);
    const plan = selectBranchesToDelete(branches);

    expect(plan.kept).toEqual([
      'beta/v0.1.5',
      'beta/v0.1.6',
      'beta/v0.1.7',
      'beta/v0.1.8',
      'beta/v0.1.9'
    ]);
    expect(plan.toDelete).toEqual([
      'beta/v0.1.0',
      'beta/v0.1.1',
      'beta/v0.1.2',
      'beta/v0.1.3',
      'beta/v0.1.4'
    ]);
  });

  test('uses numeric sorting rather than lexicographical sorting', () => {
    const branches = [
      'alpha/v0.1.2',
      'alpha/v0.1.8',
      'alpha/v0.1.9',
      'alpha/v0.1.10',
      'alpha/v0.1.11',
      'alpha/v0.1.12'
    ];
    const plan = selectBranchesToDelete(branches);

    expect(plan.kept).toEqual([
      'alpha/v0.1.8',
      'alpha/v0.1.9',
      'alpha/v0.1.10',
      'alpha/v0.1.11',
      'alpha/v0.1.12'
    ]);
    expect(plan.toDelete).toEqual(['alpha/v0.1.2']);
  });

  test('keeps only the 5 newest minor groups per major', () => {
    const branches = [
      'beta/v0.31.0',
      'beta/v0.32.0',
      'beta/v0.32.1',
      'beta/v0.33.0',
      'beta/v0.34.0',
      'beta/v0.35.0',
      'beta/v0.36.0',
      'beta/v0.37.0'
    ];
    const plan = selectBranchesToDelete(branches);

    expect(plan.kept).toEqual([
      'beta/v0.33.0',
      'beta/v0.34.0',
      'beta/v0.35.0',
      'beta/v0.36.0',
      'beta/v0.37.0'
    ]);
    expect(plan.toDelete).toEqual(['beta/v0.31.0', 'beta/v0.32.0', 'beta/v0.32.1']);
  });

  test('keeps only the 5 newest major groups per channel', () => {
    const branches = [
      'stable/v0.9.0',
      'stable/v1.0.0',
      'stable/v2.0.0',
      'stable/v3.0.0',
      'stable/v4.0.0',
      'stable/v5.0.0',
      'stable/v6.0.0'
    ];
    const plan = selectBranchesToDelete(branches);

    expect(plan.kept).toEqual([
      'stable/v2.0.0',
      'stable/v3.0.0',
      'stable/v4.0.0',
      'stable/v5.0.0',
      'stable/v6.0.0'
    ]);
    expect(plan.toDelete).toEqual(['stable/v0.9.0', 'stable/v1.0.0']);
  });

  test('evaluates channels independently and ignores non-release branches', () => {
    const branches = [
      'main',
      'feat/test',
      'latest/v0.1.0',
      'alpha/v0.1.0',
      'alpha/v0.1.1',
      'alpha/v0.1.2',
      'alpha/v0.1.3',
      'alpha/v0.1.4',
      'alpha/v0.1.5',
      'beta/v0.1.0'
    ];
    const plan = selectBranchesToDelete(branches);

    expect(plan.kept).toEqual([
      'alpha/v0.1.1',
      'alpha/v0.1.2',
      'alpha/v0.1.3',
      'alpha/v0.1.4',
      'alpha/v0.1.5',
      'beta/v0.1.0'
    ]);
    expect(plan.toDelete).toEqual(['alpha/v0.1.0']);
  });

  test('skips branches protected by open pull requests', () => {
    const branches = [
      'next/v0.1.0',
      'next/v0.1.1',
      'next/v0.1.2',
      'next/v0.1.3',
      'next/v0.1.4',
      'next/v0.1.5',
      'next/v0.1.6'
    ];
    const plan = selectBranchesToDelete(branches, {
      protectedBranches: new Set(['next/v0.1.0'])
    });

    expect(plan.skippedProtected).toEqual(['next/v0.1.0']);
    expect(plan.toDelete).toEqual(['next/v0.1.1']);
  });
});
