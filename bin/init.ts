#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const cwd = process.cwd();

// ─── helpers ────────────────────────────────────────────────────────────────

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';
const red = '\x1b[31m';
const dim = '\x1b[2m';

function log(msg: string) { process.stdout.write(msg + '\n'); }
function ok(msg: string) { log(`  ${green}✔${reset}  ${msg}`); }
function skip(msg: string) { log(`  ${yellow}–${reset}  ${dim}${msg} (already exists, skipped)${reset}`); }
function info(msg: string) { log(`  ${cyan}i${reset}  ${msg}`); }
function err(msg: string) { log(`  ${red}✖${reset}  ${msg}`); }

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function writeFile(filePath: string, content: string, existed: boolean) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  if (existed) {
    ok(`Updated ${path.relative(cwd, filePath)}`);
  } else {
    ok(`Created ${path.relative(cwd, filePath)}`);
  }
}

function createFile(filePath: string, content: string) {
  if (fs.existsSync(filePath)) {
    skip(path.relative(cwd, filePath));
    return;
  }
  writeFile(filePath, content, false);
}

// ─── detect project ─────────────────────────────────────────────────────────

function detectAppDir(): string | null {
  for (const candidate of ['src/app', 'app']) {
    if (fs.existsSync(path.join(cwd, candidate))) return candidate;
  }
  return null;
}

function detectPackageManager(): string {
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bunx';
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpx';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn dlx';
  return 'npx';
}

function isNextProject(): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    return !!(pkg.dependencies?.next || pkg.devDependencies?.next);
  } catch {
    return false;
  }
}

function isTypeScript(): boolean {
  return fs.existsSync(path.join(cwd, 'tsconfig.json'));
}

// ─── file templates ─────────────────────────────────────────────────────────

function apiLoginRoute(ext: string) {
  return ext === 'ts'
    ? `export { POST } from 'next-inline-editor/api/login';\n`
    : `module.exports = require('next-inline-editor/api/login');\n`;
}

function apiLogoutRoute(ext: string) {
  return ext === 'ts'
    ? `export { POST } from 'next-inline-editor/api/logout';\n`
    : `module.exports = require('next-inline-editor/api/logout');\n`;
}

function apiUploadRoute(ext: string) {
  return ext === 'ts'
    ? `export { POST } from 'next-inline-editor/api/upload';\n`
    : `module.exports = require('next-inline-editor/api/upload');\n`;
}

function apiSaveRoute(ext: string, contentFiles: string[]) {
  const filesArray = contentFiles.map((f) => `  '${f}',`).join('\n');
  if (ext === 'ts') {
    return `import { handleSave } from 'next-inline-editor/api/save';
import { type NextRequest } from 'next/server';

const ALLOWED_FILES = new Set([
${filesArray}
]);

export async function POST(request: NextRequest) {
  return handleSave(request, ALLOWED_FILES);
}
`;
  }
  return `const { handleSave } = require('next-inline-editor/api/save');

const ALLOWED_FILES = new Set([
${filesArray}
]);

module.exports = {
  async POST(request) {
    return handleSave(request, ALLOWED_FILES);
  },
};
`;
}

function adminLoginPage(ext: string) {
  if (ext === 'ts') {
    return `import { AdminLogin } from 'next-inline-editor';

export default function LoginPage() {
  return <AdminLogin />;
}
`;
  }
  return `const { AdminLogin } = require('next-inline-editor');

export default function LoginPage() {
  return <AdminLogin />;
}
`;
}

function adminPage(ext: string, appDir: string, contentFiles: string[]) {
  const firstFile = contentFiles[0] ?? 'content/home.json';
  const importPath = path.relative(path.join(cwd, appDir, 'admin'), path.join(cwd, firstFile))
    .replace(/\\/g, '/');

  const placeholder = `        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 600 }}>
          <h2 style={{ marginBottom: 12 }}>Editor ready</h2>
          <p style={{ color: '#555', lineHeight: 1.6 }}>
            Replace this placeholder with your actual page component, then add{' '}
            <code>data-edit</code> and <code>data-edit-image</code> attributes to
            make elements editable.
          </p>
          <pre style={{ marginTop: 24, padding: 16, background: '#f4f4f4', borderRadius: 6, fontSize: 13, overflowX: 'auto' }}>
            {[\`{(content) => <MyPage content={content} />}\`].join('')}
          </pre>
        </div>`;

  if (ext === 'ts') {
    return `import { AdminEditor } from 'next-inline-editor';
import content from '${importPath}';

export default function AdminPage() {
  return (
    <AdminEditor
      initialContent={content}
      contentFile="${firstFile}"
      pageLabel="Home"
    >
      {() => (
${placeholder}
      )}
    </AdminEditor>
  );
}
`;
  }
  return `const { AdminEditor } = require('next-inline-editor');
const content = require('${importPath}');

export default function AdminPage() {
  return (
    <AdminEditor
      initialContent={content}
      contentFile="${firstFile}"
      pageLabel="Home"
    >
      {() => (
${placeholder}
      )}
    </AdminEditor>
  );
}
`;
}

function envBlock(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

// ─── env helpers ────────────────────────────────────────────────────────────

function readEnv(envPath: string): string {
  try { return fs.readFileSync(envPath, 'utf-8'); } catch { return ''; }
}

function appendEnvVars(envPath: string, vars: Record<string, string>) {
  const existing = readEnv(envPath);
  const missing: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (!existing.includes(k + '=')) missing[k] = v;
  }
  if (Object.keys(missing).length === 0) {
    skip('.env.local (all variables already present)');
    return;
  }
  const block = '\n# next-inline-editor\n' + envBlock(missing) + '\n';
  fs.writeFileSync(envPath, existing + block, 'utf-8');
  ok(`.env.local — added: ${Object.keys(missing).join(', ')}`);
}

// ─── detect existing content files ──────────────────────────────────────────

function findContentFiles(): string[] {
  const candidates: string[] = [];
  for (const dir of ['content', 'src/content']) {
    const full = path.join(cwd, dir);
    if (!fs.existsSync(full)) continue;
    const jsons = fs.readdirSync(full, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => `${dir}/${d.name}`);
    candidates.push(...jsons);
    // one level deep (e.g. content/properties/*.json)
    const subdirs = fs.readdirSync(full, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const sub of subdirs) {
      const subFull = path.join(full, sub.name);
      const subJsons = fs.readdirSync(subFull, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.json'))
        .map((d) => `${dir}/${sub.name}/${d.name}`);
      candidates.push(...subJsons);
    }
  }
  return candidates;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log(`${bold}next-inline-editor — project setup${reset}`);
  log('────────────────────────────────────');
  log('');

  // Sanity checks
  if (!isNextProject()) {
    err('No Next.js project found in current directory.');
    err('Run this command from the root of your Next.js project.');
    process.exit(1);
  }

  const appDir = detectAppDir();
  if (!appDir) {
    err('Could not find an app/ or src/app/ directory.');
    err('This package requires the Next.js App Router.');
    process.exit(1);
  }

  const ext = isTypeScript() ? 'ts' : 'js';
  const xExt = ext === 'ts' ? 'tsx' : 'jsx';

  info(`Detected: ${appDir}/ (${ext === 'ts' ? 'TypeScript' : 'JavaScript'})`);
  log('');

  // Find existing content JSON files
  const contentFiles = findContentFiles();
  if (contentFiles.length > 0) {
    info(`Found content files:`);
    for (const f of contentFiles) log(`      ${dim}${f}${reset}`);
  } else {
    info(`No content JSON files found yet — you can add them later.`);
    contentFiles.push('content/home.json');
  }
  log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await ask(
    rl,
    `  ${cyan}?${reset}  Create admin pages and API routes? (Y/n) `
  );
  rl.close();
  log('');

  if (answer.toLowerCase() === 'n') {
    log('Aborted.');
    return;
  }

  // API routes
  log(`${bold}API routes${reset}`);
  createFile(path.join(cwd, appDir, 'api/admin/login/route.' + ext), apiLoginRoute(ext));
  createFile(path.join(cwd, appDir, 'api/admin/logout/route.' + ext), apiLogoutRoute(ext));
  createFile(path.join(cwd, appDir, 'api/admin/upload/route.' + ext), apiUploadRoute(ext));
  createFile(path.join(cwd, appDir, 'api/admin/save/route.' + ext), apiSaveRoute(ext, contentFiles));
  log('');

  // Admin pages
  log(`${bold}Admin pages${reset}`);
  createFile(path.join(cwd, appDir, 'admin/login/page.' + xExt), adminLoginPage(ext));
  createFile(path.join(cwd, appDir, 'admin/page.' + xExt), adminPage(ext, appDir, contentFiles));
  log('');

  // Env vars
  log(`${bold}Environment variables${reset}`);
  const envPath = path.join(cwd, '.env.local');
  appendEnvVars(envPath, {
    ADMIN_PASSWORD: 'your-secure-password-here',
    ADMIN_SESSION_SECRET: randomHex(32),
    GITHUB_TOKEN: 'ghp_your-token-here',
    GITHUB_REPO: 'owner/repo-name',
    GITHUB_BRANCH: 'main',
  });
  log('');

  // Summary
  log('────────────────────────────────────');
  log(`${bold}${green}Setup complete!${reset}`);
  log('');
  log(`${bold}Next steps:${reset}`);
  log('');
  log(`  1. ${bold}Fill in .env.local${reset}`);
  log(`     • Set ADMIN_PASSWORD to a secure password`);
  log(`     • Get a GitHub token at https://github.com/settings/tokens`);
  log(`       (needs Contents: Read and write scope)`);
  log(`     • Set GITHUB_REPO to your "owner/repo-name"`);
  log('');
  log(`  2. ${bold}Add data-edit attributes to your components${reset}`);
  log(`     On any text element:   ${cyan}data-edit="hero.title"${reset}`);
  log(`     On any image element:  ${cyan}data-edit-image="hero.backgroundImage"${reset}`);
  log('');
  log(`  3. ${bold}Update ${appDir}/admin/page.${xExt}${reset}`);
  log(`     Replace the JSON preview with your actual page component`);
  log('');
  log(`  4. ${bold}Visit /admin/login${reset} and start editing`);
  log('');
  log(`  See the full guide: ${dim}https://github.com/madebytie/next-inline-editor#readme${reset}`);
  log('');
}

function randomHex(bytes: number): string {
  // Use crypto.randomBytes if available, otherwise fall back to Math.random
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.randomBytes(bytes).toString('hex');
  } catch {
    return Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

main().catch((e) => {
  err(String(e));
  process.exit(1);
});
