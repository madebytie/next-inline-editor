import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminCookieName, verifySession } from '../lib/admin-auth';
import { commitFile } from '../lib/github';

/**
 * Call this inside your own POST route handler.
 *
 * allowedFiles: set of repo-relative paths that can be written,
 * e.g. new Set(['content/home.json', 'content/properties/beach-house.json'])
 *
 * You can also read these from an env var:
 * const allowedFiles = new Set(process.env.ALLOWED_CONTENT_FILES!.split(','))
 */
export async function handleSave(request: Request, allowedFiles: Set<string>) {
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

  if (!body.file || !allowedFiles.has(body.file)) {
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
