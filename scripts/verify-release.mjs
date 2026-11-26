import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SITE_ORIGIN } from './build.mjs';
import { PUBLIC_FILES, PRIVATE_FILES } from './public-files.mjs';

// Проверяет сохранённый/распакованный релиз, не меняя его содержимое.
export async function verifyRelease(destination = resolve(ROOT, 'dist')) {
  const output = resolve(destination);
  assert.deepEqual((await readdir(output)).sort(), ['private', 'public_html', 'release-manifest.json']);
  const publicRoot = resolve(output, 'public_html');
  assert.ok((await lstat(publicRoot)).isDirectory(), 'public_html должен быть каталогом, не ссылкой');
  const entries = await readdir(publicRoot, { recursive: true, withFileTypes: true });
  assert.ok(entries.every(entry => entry.isFile() || entry.isDirectory()), 'Ссылки в релизе запрещены');
  const actual = entries.filter(entry => entry.isFile())
    .map(entry => relative(publicRoot, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  assert.deepEqual(actual, [...PUBLIC_FILES].sort(), 'Состав публикации не соответствует allowlist');
  assert.deepEqual(entries.filter(entry => entry.isDirectory()).map(entry => entry.name), ['assets'], 'Лишний каталог в публикации');
  const manifest = JSON.parse(await readFile(resolve(output, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.origin, SITE_ORIGIN);
  assert.equal(manifest.publicDirectory, 'public_html');
  assert.deepEqual(manifest.files.map(file => file.name).sort(), [...PUBLIC_FILES].sort(), 'Манифест не соответствует allowlist');
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(publicRoot, file.name));
    assert.equal(bytes.length, file.size, `Размер ${file.name}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `SHA-256 ${file.name}`);
  }
  const html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
  const site = await readFile(resolve(publicRoot, 'site.js'));
  const project = await readFile(resolve(publicRoot, 'project.js'));
  assert.equal(html.match(/src="site\.js\?v=([a-f0-9]{64})"/)?.[1], createHash('sha256').update(site).digest('hex'), 'Версия site.js');
  assert.equal(site.toString().match(/from '\.\/project\.js\?v=([a-f0-9]{64})'/)?.[1], createHash('sha256').update(project).digest('hex'), 'Версия project.js');
  for (const [page, css] of [['index.html','styles.css'], ['privacy.html','privacy.css']]) {
    const pageText = await readFile(resolve(publicRoot, page), 'utf8');
    const bytes = await readFile(resolve(publicRoot, css));
    assert.ok(pageText.includes(`${css}?v=${createHash('sha256').update(bytes).digest('hex')}`), `Версия ${css}`);
  }
  assert.equal(html.match(/src="navigation\.js\?v=([a-f0-9]{64})"/)?.[1], createHash('sha256').update(await readFile(resolve(publicRoot,'navigation.js'))).digest('hex'));
  assert.equal(manifest.privateDirectory, 'private');
  const privateRoot = resolve(output,'private');
  assert.ok((await lstat(privateRoot)).isDirectory(), 'private должен быть каталогом, не ссылкой');
  const privateEntries = await readdir(privateRoot,{recursive:true,withFileTypes:true});
  assert.ok(privateEntries.every(e=>e.isFile()||e.isDirectory()), 'Ссылки в серверной части запрещены');
  const names = privateEntries.filter(e=>e.isFile()).map(e=>relative(privateRoot,resolve(e.parentPath,e.name)).replaceAll('\\','/')).sort();
  assert.deepEqual(names,[...PRIVATE_FILES].sort());
  assert.deepEqual(manifest.privateFiles.map(f=>f.name).sort(),names);
  for(const file of manifest.privateFiles) {
    const bytes = await readFile(resolve(privateRoot,file.name));
    assert.equal(bytes.length,file.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  }
  const form = await readFile(resolve(privateRoot,'form.php'),'utf8');
  for(const resource of ['styles.css','request.css','request.js']) assert.ok(form.includes(`${resource}?v=${createHash('sha256').update(await readFile(resolve(publicRoot,resource))).digest('hex')}`));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await verifyRelease(process.argv[2]);
  console.log(`Релиз проверен: ${manifest.files.length} файлов, SHA-256, allowlist и версии модулей совпадают.`);
}
