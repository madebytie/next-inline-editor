'use client';

import { useEffect, useRef, useState } from 'react';
import { getByPath, setByPath } from '../lib/path-utils';

export interface AdminEditorProps {
  /**
   * The current content object. Must be JSON-serializable.
   * The editor tracks changes internally and POSTs the updated object on save.
   */
  initialContent: Record<string, unknown>;

  /**
   * Repo-relative path to the JSON file that stores this content,
   * e.g. "content/home.json" or "content/properties/beach-house.json"
   */
  contentFile: string;

  /**
   * Label shown in the page selector dropdown for this page.
   */
  pageLabel: string;

  /**
   * Other pages to include in the page-switcher dropdown.
   * Switching navigates to href, with an unsaved-changes guard.
   */
  pages?: Array<{ label: string; href: string }>;

  /**
   * Your page components rendered inside the editor.
   * They should use data-edit="path.to.field" and data-edit-image="path.to.field"
   * attributes on editable elements — the editor wires those up automatically.
   *
   * Call the provided setContent to pass live content to your components:
   *
   * children={(content, setContent) => <MyPage content={content} />}
   */
  children: (
    content: Record<string, unknown>,
    setContent: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  ) => React.ReactNode;

  /**
   * API route paths. Defaults match the recommended setup guide locations.
   */
  routes?: {
    save?: string;
    upload?: string;
    logout?: string;
  };
}

export default function AdminEditor({
  initialContent,
  contentFile,
  pageLabel,
  pages = [],
  children,
  routes = {},
}: AdminEditorProps) {
  const saveRoute = routes.save ?? '/api/admin/save';
  const uploadRoute = routes.upload ?? '/api/admin/upload';
  const logoutRoute = routes.logout ?? '/api/admin/logout';

  const [content, setContent] = useState<Record<string, unknown>>(initialContent);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'success' | 'error'; message?: string }>({ kind: 'idle' });
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePathRef = useRef<string | null>(null);
  const previewMapRef = useRef<Map<string, string>>(new Map());

  function setContentWithDirty(updater: (prev: Record<string, unknown>) => Record<string, unknown>) {
    setContent((prev) => {
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }

  function applyPreview(path: string, dataUrl: string) {
    previewMapRef.current.set(path, dataUrl);
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-edit-image="${CSS.escape(path)}"]`);
    if (!el) return;
    el.style.backgroundImage = `url("${dataUrl}")`;
    el.style.backgroundSize = el.style.backgroundSize || 'cover';
    el.style.backgroundPosition = el.style.backgroundPosition || 'center';
    delete el.dataset.bg;
    if (el instanceof HTMLImageElement) el.src = dataUrl;
  }

  useEffect(() => {
    for (const [path, dataUrl] of previewMapRef.current.entries()) {
      applyPreview(path, dataUrl);
    }
  });

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = rootRef.current;
    if (!root) return;

    const textNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-edit]'));
    const imageNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-edit-image]'));
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));

    const linkBlocker = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    for (const a of links) {
      a.addEventListener('click', linkBlocker, true);
      a.dataset.adminPrevHref = a.getAttribute('href') ?? '';
      a.removeAttribute('href');
      a.style.cursor = 'default';
    }

    const textHandlers: Array<{ el: HTMLElement; onBlur: () => void }> = [];
    for (const el of textNodes) {
      if (!el.dataset.edit) continue;
      el.contentEditable = 'plaintext-only';
      el.classList.add('nie-editable');
      const onBlur = () => {
        const path = el.dataset.edit;
        if (!path) return;
        const next = el.innerText;
        const current = String(getByPath(content, path) ?? '');
        if (next !== current) {
          setContent((prev) => setByPath(prev, path, next));
          setDirty(true);
        }
      };
      el.addEventListener('blur', onBlur);
      textHandlers.push({ el, onBlur });
    }

    const imageHandlers: Array<{ el: HTMLElement; badge: HTMLButtonElement }> = [];
    for (const el of imageNodes) {
      if (!el.dataset.editImage) continue;
      el.classList.add('nie-editable-image');
      const host = (el.offsetParent as HTMLElement | null) ?? el;
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'nie-image-badge';
      badge.textContent = 'Change image';
      badge.dataset.adminBadge = '1';
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const path = el.dataset.editImage;
        if (!path) return;
        pendingImagePathRef.current = path;
        fileInputRef.current?.click();
      });
      host.appendChild(badge);
      imageHandlers.push({ el, badge });
    }

    return () => {
      for (const { el, onBlur } of textHandlers) {
        el.removeEventListener('blur', onBlur);
        el.removeAttribute('contenteditable');
        el.classList.remove('nie-editable');
      }
      for (const { el, badge } of imageHandlers) {
        badge.remove();
        el.classList.remove('nie-editable-image');
      }
      for (const a of links) {
        a.removeEventListener('click', linkBlocker, true);
        const prev = a.dataset.adminPrevHref;
        if (prev !== undefined) {
          a.setAttribute('href', prev);
          delete a.dataset.adminPrevHref;
        }
        a.style.cursor = '';
      }
    };
  }, [content, hydrated]);

  async function onImageChosen(file: File) {
    const path = pendingImagePathRef.current;
    pendingImagePathRef.current = null;
    if (!path) return;

    setStatus({ kind: 'idle' });
    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(uploadRoute, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ kind: 'error', message: body.error || 'Upload failed' });
        return;
      }
      const { url, previewUrl } = await res.json();
      if (previewUrl) applyPreview(path, previewUrl);
      setContent((prev) => setByPath(prev, path, url));
      setDirty(true);
    } catch {
      setStatus({ kind: 'error', message: 'Upload network error' });
    }
  }

  async function onSave() {
    setSaving(true);
    setStatus({ kind: 'idle' });
    try {
      const res = await fetch(saveRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: contentFile, content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ kind: 'error', message: body.error || 'Save failed' });
        setSaving(false);
        return;
      }
      setDirty(false);
      setStatus({ kind: 'success', message: 'Saved. Live site updates in ~1 minute.' });
    } catch {
      setStatus({ kind: 'error', message: 'Save network error' });
    }
    setSaving(false);
  }

  async function onLogout() {
    await fetch(logoutRoute, { method: 'POST' });
    window.location.href = '/admin/login';
  }

  function onPageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (dirty) {
      const ok = confirm('You have unsaved changes. Switch pages and discard them?');
      if (!ok) {
        e.target.value = 'current';
        return;
      }
    }
    const href = e.target.value;
    if (href !== 'current') window.location.href = href;
  }

  return (
    <>
      <style>{`
        .nie-editable {
          outline: 1px dashed rgba(255, 200, 0, 0.4);
          outline-offset: 2px;
          cursor: text;
          transition: outline-color 0.15s;
        }
        .nie-editable:hover { outline-color: rgba(255, 200, 0, 0.9); }
        .nie-editable:focus { outline: 2px solid #ffc800; background: rgba(255, 200, 0, 0.08); }
        .nie-editable-image {
          outline: 2px dashed rgba(0, 200, 255, 0.5) !important;
          outline-offset: -4px;
        }
        .nie-image-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 9999;
          padding: 6px 12px;
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          border: 1px solid rgba(0, 200, 255, 0.6);
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          font-family: system-ui, sans-serif;
          cursor: pointer;
          backdrop-filter: blur(4px);
          transition: background 0.15s, border-color 0.15s;
        }
        .nie-image-badge:hover {
          background: rgba(0, 200, 255, 0.9);
          color: #000;
          border-color: rgba(0, 200, 255, 1);
        }
      `}</style>

      <div ref={rootRef}>
        {children(content, setContentWithDirty)}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageChosen(file);
          e.target.value = '';
        }}
      />

      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {status.message && (
          <div style={{
            padding: '8px 14px',
            borderRadius: 6,
            background: status.kind === 'success' ? '#0f5132' : '#842029',
            color: '#fff',
            fontSize: 13,
            maxWidth: 320,
          }}>
            {status.message}
          </div>
        )}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          background: 'rgba(20,20,20,0.95)',
          border: '1px solid #333',
          borderRadius: 8,
          backdropFilter: 'blur(8px)',
          alignItems: 'center',
        }}>
          {pages.length > 0 && (
            <select
              defaultValue="current"
              onChange={onPageChange}
              style={{
                padding: '10px 12px',
                background: '#0a0a0a',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value="current">{pageLabel}</option>
              {pages.map((p) => (
                <option key={p.href} value={p.href}>{p.label}</option>
              ))}
            </select>
          )}
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            style={{
              padding: '10px 18px',
              background: dirty ? '#ffc800' : '#444',
              color: dirty ? '#000' : '#888',
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save & Publish' : 'No changes'}
          </button>
          <a
            href="https://github.com/madebytie/next-inline-editor#readme"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '10px 14px',
              background: 'transparent',
              color: '#aaa',
              border: '1px solid #333',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'none',
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            title="Documentation"
          >
            ?
          </a>
          <button
            onClick={onLogout}
            style={{
              padding: '10px 14px',
              background: 'transparent',
              color: '#aaa',
              border: '1px solid #333',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
