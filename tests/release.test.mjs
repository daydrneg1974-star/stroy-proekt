import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from '../scripts/public-files.mjs';
import { verifyRelease } from '../scripts/verify-release.mjs';
import { renderContacts } from '../scripts/contacts.mjs';

test('основная команда собирает SpaceWeb: полный манифест, контакты, единые тексты и noindex', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'stroy-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const rootProject = fileURLToPath(new URL('..', import.meta.url));
  const contacts = JSON.parse(await readFile(join(rootProject, 'contacts.json'), 'utf8'));
  execFileSync('npm', ['run', 'build', '--', temporary], { cwd: rootProject });
  const root = join(temporary, 'public_html');
  const manifest = JSON.parse(await readFile(join(temporary, 'release-manifest.json')));
  const actual = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort();
  assert.deepEqual(actual, [...PUBLIC_FILES].sort());
  assert.deepEqual(manifest.files.map(file => file.name).sort(), [...PUBLIC_FILES].sort());
  assert.equal(manifest.origin, 'https://stroyinzh-dom.ru');
  assert.equal(manifest.publicDirectory, 'public_html');
  for (const file of manifest.files) {
    const bytes = await readFile(join(root, file.name));
    assert.equal(file.size, bytes.length, file.name);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'), file.name);
    if (file.name.startsWith('assets/')) assert.deepEqual(bytes, await readFile(join(rootProject, file.name)), file.name);
  }
  for (const name of ['index.html', 'privacy.html']) {
    const page = await readFile(join(root, name), 'utf8');
    assert.doesNotMatch(page, /<form\b|mailto:|__cf_bm|chatgpt\.site|приём заявок пока не открыт/i);
    assert.doesNotMatch(page, /\bMAX\b/);
    assert.match(page, /noindex,nofollow/);
    assert.match(page, /no-referrer/);
    assert.match(page, /href="tel:\+74991306616"/);
    assert.match(page, /SpaceWeb/);
    assert.match(page, /реквизитами оператора будет опубликована после их подтверждения/);
    const source = await readFile(join(rootProject, name), 'utf8');
    assert.equal(page.replace(/(site\.js|navigation\.js|styles\.css|privacy\.css)\?v=[a-f0-9]{64}/g, '$1'), renderContacts(source.replace(/\r\n?/g, '\n').trimEnd(), contacts), 'Одинаковые тексты и конфигурация дают один вариант страницы');
    assert.doesNotMatch(page, /\{\{[A-Z_]+\}\}|Telegram|аккаунт.*не подтвержд/);
  }
  const index = await readFile(join(root, 'index.html'), 'utf8');
  assert.match(index, /href="https:\/\/wa\.me\/74991306616"/);
  assert.doesNotMatch(index, /t\.me/);
  assert.match(index, /Получатель: СтройИнжиниринг\./);
  assert.match(index, /https:\/\/stroyinzh-dom.ru\/assets\/image-1.webp/);
  assert.equal(await readFile(join(root, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /');
  const apache = await readFile(join(root, '.htaccess'), 'utf8');
  assert.match(apache, /RewriteRule \^privacy\/\?\$ https:\/\/stroyinzh-dom\.ru\/privacy\.html \[R=302,L\]/);
  assert.match(apache, /X-Robots-Tag "noindex, nofollow, noarchive"/);
  assert.match(apache, /RewriteCond %\{HTTP:HTTPS\} !=on/);
  assert.match(apache, /Require all denied/);
  assert.deepEqual(await verifyRelease(temporary), manifest);
  execFileSync('npm', ['run', 'verify:release', '--', temporary], { cwd: rootProject });

  await writeFile(join(root, 'site.js'), 'changed after build');
  await assert.rejects(verifyRelease(temporary), /Размер site\.js|SHA-256 site\.js/);
  await writeFile(join(root, 'private.txt'), 'not public');
  await assert.rejects(verifyRelease(temporary), /allowlist/);
});
