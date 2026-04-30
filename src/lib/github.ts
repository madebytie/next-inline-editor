import { Octokit } from '@octokit/rest';

function getEnv(): { token: string; owner: string; repo: string; branch: string } {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN not set');
  if (!repoFull) throw new Error('GITHUB_REPO not set (expected "owner/name")');
  const [owner, repo] = repoFull.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPO must be in "owner/name" format');
  return { token, owner, repo, branch };
}

export async function commitFile(opts: {
  path: string;
  content: Buffer | string;
  message: string;
}): Promise<{ commit: string; url: string }> {
  const { token, owner, repo, branch } = getEnv();
  const octokit = new Octokit({ auth: token });

  let sha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({ owner, repo, path: opts.path, ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) {
      sha = existing.data.sha;
    }
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status !== 404) {
      throw err;
    }
  }

  const contentBase64 = Buffer.isBuffer(opts.content)
    ? opts.content.toString('base64')
    : Buffer.from(opts.content, 'utf-8').toString('base64');

  const res = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: opts.path,
    message: opts.message,
    content: contentBase64,
    branch,
    sha,
  });

  return {
    commit: res.data.commit.sha ?? '',
    url: res.data.content?.html_url ?? '',
  };
}
