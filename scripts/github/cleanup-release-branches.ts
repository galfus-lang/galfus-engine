export const RELEASE_BRANCH_PATTERN =
  /^(?<channel>alpha|beta|stable|next)\/v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/;

export type ParsedReleaseBranch = {
  name: string;
  channel: string;
  major: number;
  minor: number;
  patch: number;
};

export type CleanupOptions = {
  keepCount?: number;
  protectedBranches?: ReadonlySet<string>;
};

export type CleanupPlan = {
  kept: string[];
  toDelete: string[];
  skippedProtected: string[];
};

export function parseReleaseBranch(branchName: string): ParsedReleaseBranch | null {
  const match = RELEASE_BRANCH_PATTERN.exec(branchName);
  if (!match?.groups) return null;

  const { channel, major, minor, patch } = match.groups;
  if (!channel || !major || !minor || !patch) return null;

  return {
    name: branchName,
    channel,
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10)
  };
}

function sortDesc(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => b - a);
}

function compareBranchesAsc(a: ParsedReleaseBranch, b: ParsedReleaseBranch): number {
  if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function selectBranchesToDelete(
  branchNames: readonly string[],
  options: CleanupOptions = {}
): CleanupPlan {
  const keepCount = options.keepCount ?? 5;
  if (!Number.isInteger(keepCount) || keepCount < 1) {
    throw new Error(`Invalid keepCount: ${keepCount}. Expected a positive integer.`);
  }

  const protectedBranches = options.protectedBranches ?? new Set<string>();
  const parsed: ParsedReleaseBranch[] = [];
  for (const name of branchNames) {
    const entry = parseReleaseBranch(name);
    if (entry) parsed.push(entry);
  }

  const byChannel = new Map<string, ParsedReleaseBranch[]>();
  for (const branch of parsed) {
    const list = byChannel.get(branch.channel);
    if (list) list.push(branch);
    else byChannel.set(branch.channel, [branch]);
  }

  const keptSet = new Set<string>();

  for (const channelBranches of byChannel.values()) {
    const majors = new Set(channelBranches.map((b) => b.major));
    const keptMajors = new Set(sortDesc(majors).slice(0, keepCount));

    for (const major of keptMajors) {
      const majorBranches = channelBranches.filter((b) => b.major === major);
      const minors = new Set(majorBranches.map((b) => b.minor));
      const keptMinors = new Set(sortDesc(minors).slice(0, keepCount));

      for (const minor of keptMinors) {
        const minorBranches = majorBranches
          .filter((b) => b.minor === minor)
          .sort((a, b) => b.patch - a.patch);

        for (const branch of minorBranches.slice(0, keepCount)) {
          keptSet.add(branch.name);
        }
      }
    }
  }

  const sortedParsed = [...parsed].sort(compareBranchesAsc);
  const kept: string[] = [];
  const toDelete: string[] = [];
  const skippedProtected: string[] = [];

  for (const branch of sortedParsed) {
    if (keptSet.has(branch.name)) {
      kept.push(branch.name);
    } else if (protectedBranches.has(branch.name)) {
      skippedProtected.push(branch.name);
    } else {
      toDelete.push(branch.name);
    }
  }

  return { kept, toDelete, skippedProtected };
}

type GitHubBranch = { name: string };
type GitHubPullRequest = { head?: { ref?: string }; base?: { ref?: string } };

async function githubFetchJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API GET ${url} failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

async function listPaginated<T>(baseUrl: string, token: string): Promise<T[]> {
  const items: T[] = [];
  const separator = baseUrl.includes('?') ? '&' : '?';

  for (let page = 1; ; page++) {
    const url = `${baseUrl}${separator}per_page=100&page=${page}`;
    const pageItems = await githubFetchJson<T[]>(url, token);
    items.push(...pageItems);
    if (pageItems.length < 100) break;
  }

  return items;
}

async function deleteBranchRef(repo: string, branch: string, token: string): Promise<void> {
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${repo}/git/refs/heads/${encodedBranch}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`Failed to delete branch "${branch}" (${response.status}): ${body}`);
  }
}

async function main(): Promise<void> {
  const dryRun = Bun.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const keepArg = Bun.argv.find((arg) => arg.startsWith('--keep='));
  const keepCount = keepArg ? Number.parseInt(keepArg.slice('--keep='.length), 10) : 5;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required.');
  }

  const [branches, openPrs] = await Promise.all([
    listPaginated<GitHubBranch>(`https://api.github.com/repos/${repo}/branches`, token),
    listPaginated<GitHubPullRequest>(`https://api.github.com/repos/${repo}/pulls?state=open`, token)
  ]);

  const protectedBranches = new Set<string>();
  for (const pr of openPrs) {
    if (pr.head?.ref) protectedBranches.add(pr.head.ref);
    if (pr.base?.ref) protectedBranches.add(pr.base.ref);
  }

  const plan = selectBranchesToDelete(
    branches.map((b) => b.name),
    { keepCount, protectedBranches }
  );

  console.log(
    `[cleanup-release-branches] Mode: ${dryRun ? 'DRY RUN' : 'DELETE'} | Keep per group: ${keepCount}`
  );
  console.log(`  Kept (${plan.kept.length}): ${plan.kept.join(', ') || 'none'}`);
  if (plan.skippedProtected.length > 0) {
    console.log(
      `  Protected by open PR (${plan.skippedProtected.length}): ${plan.skippedProtected.join(', ')}`
    );
  }
  console.log(`  To delete (${plan.toDelete.length}): ${plan.toDelete.join(', ') || 'none'}`);

  if (dryRun || plan.toDelete.length === 0) {
    return;
  }

  for (const branch of plan.toDelete) {
    console.log(`  Deleting ${branch}...`);
    await deleteBranchRef(repo, branch, token);
  }

  console.log(`[cleanup-release-branches] Deleted ${plan.toDelete.length} branch(es).`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('[cleanup-release-branches] Failed:', error);
    process.exitCode = 1;
  });
}
