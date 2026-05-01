import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminCookieName, verifySession } from '../lib/admin-auth';
import { commitFile } from '../lib/github';

function isAllowedPath(file: string): boolean {
  // Must start with content/ or src/content/, end in .json, no traversal
  return (
    /^(src\/)?content\/.+\.json$/.test(file) &&
    !file.includes('..')
  );
}

export async function handleSave(request: Request, allowedFiles?: Set<string>) {
  const session = (await cookies()).get(adminCookieName())?.value;
  if (!verifySession(session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { file?: string; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowed = allowedFiles
    ? allowedFiles.has(body.file ?? '')
    : isAllowedPath(body.file ?? '');

  if (!body.file || !allowed) {
    return NextResponse.json({ error: 'File not allowed' }, { status: 400 });
  }
  if (typeof body.content !== 'object' || body.content === null) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  const json = JSON.stringify(body.content, null, 2) + '\n';

  try {
    const result = await commitFile({
      path: body.file,
      content: json,
      message: `content: edit ${body.file} via admin`,
    });
    return NextResponse.json({ ok: true, commit: result.commit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'commit failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
