import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminCookieName, verifySession } from '../lib/admin-auth';
import { commitFile } from '../lib/github';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function extFromType(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'bin';
}

/**
 * Call this inside your own POST route handler.
 *
 * uploadDir: repo-relative directory for uploaded images (default: 'public/uploads')
 * publicPrefix: URL prefix for the returned image URL (default: '/uploads')
 */
export async function handleUpload(
  request: Request,
  opts: { uploadDir?: string; publicPrefix?: string } = {}
) {
  const session = (await cookies()).get(adminCookieName())?.value;
  if (!verifySession(session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const uploadDir = opts.uploadDir ?? 'public/uploads';
  const publicPrefix = opts.publicPrefix ?? '/uploads';

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stamp = Date.now();
  const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const ext = extFromType(file.type);
  const filename = `${stamp}-${base}.${ext}`;
  const path = `${uploadDir}/${filename}`;
  const publicUrl = `${publicPrefix}/${filename}`;

  try {
    await commitFile({
      path,
      content: buffer,
      message: `content: upload ${filename} via admin`,
    });
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    return NextResponse.json({ ok: true, url: publicUrl, previewUrl: dataUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
