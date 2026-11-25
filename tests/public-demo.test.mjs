import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from '../scripts/public-files.mjs';

test('публичная сборка: полный манифест, ссылки и отсутствие приёма обращений', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'stroy-public-demo-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-public-demo.mjs', import.meta.url)), temporary]);
  const root = join(temporary, 'public_html');
  const manifest = JSON.parse(await readFile(join(temporary, 'release-manifest.json')));
  const allowed = [...PUBLIC_FILES, '.htaccess', 'robots.txt'].sort();
  const actual = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort();
  assert.deepEqual(actual, allowed);
  assert.deepEqual(manifest.files.map(file => file.name).sort(), allowed);
  for (const file of manifest.files) {
    const bytes = await readFile(join(root, file.name));
    assert.equal(file.size, bytes.length, file.name);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'), file.name);
  }
  for (const name of ['index.html', 'privacy.html']) {
    const page = await readFile(join(root, name), 'utf8');
    assert.doesNotMatch(page, /<form\b|tel:|t\.me|wa\.me|Telegram|WhatsApp|мессенджер|__cf_bm|chatgpt\.site/i);
    assert.match(page, /noindex,nofollow/);
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, reference] of page.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
      if (reference.startsWith('#')) assert.ok(ids.includes(reference.slice(1)), reference);
      else if (/^https:/.test(reference)) {
        assert.ok(reference.startsWith('https://stroyinzh-dom.ru/') || reference === 'https://help.sweb.ru/kak-posmotret6-logi_42.html', reference);
      } else {
        const [pathAndQuery, anchor] = reference.split('#');
        const path = pathAndQuery.split('?')[0];
        assert.ok(allowed.includes(path), reference);
        if (anchor) assert.ok((await readFile(join(root, path), 'utf8')).includes(`id="${anchor}"`), reference);
      }
    }
  }
  const index = await readFile(join(root, 'index.html'), 'utf8');
  const site = await readFile(join(root, 'site.js'));
  const project = await readFile(join(root, 'project.js'));
  assert.equal(index.match(/site\.js\?v=([a-f0-9]{64})/)[1], createHash('sha256').update(site).digest('hex'));
  assert.equal(site.toString().match(/project\.js\?v=([a-f0-9]{64})/)[1], createHash('sha256').update(project).digest('hex'));
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const quotes = text => [...text.matchAll(/<blockquote\b[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(quotes(index), quotes(source), 'Цитаты должны сохраняться дословно.');
  assert.match(index, /https:\/\/stroyinzh-dom.ru\/assets\/image-1.webp/);
  assert.equal(await readFile(join(root, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  assert.match(await readFile(join(root, '.htaccess'), 'utf8'), /RewriteRule \^privacy\/\?\$ https:\/\/stroyinzh-dom\.ru\/privacy\.html \[R=302,L\]/);
});
