import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_FILES } from '../scripts/public-files.mjs';

// Exercise unsafe destinations against an isolated copy of the actual builder.
// Placeholder public files satisfy the same lstat validation, without ever
// passing a real project path to the destructive part of the builder.
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'stroyengineering-unsafe-build-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const parent = join(temporary, 'parent');
  const root = join(parent, 'project');
  const sentinel = join(parent, 'do-not-delete.txt');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(sentinel, 'unrelated neighbouring file');
  for (const name of PUBLIC_FILES) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), `original public source: ${name}`);
  }
  for (const name of ['build.mjs', 'public-files.mjs']) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  const { build } = await import(pathToFileURL(join(root, 'scripts/build.mjs')));
  return { parent, root, sentinel, build };
}

for (const destination of ['parent', 'assets', 'index.html']) {
  test(`сборка отклоняет опасную цель ${destination} до удаления исходных файлов`, async t => {
    const { parent, root, sentinel, build } = await fixture(t);
    const target = destination === 'parent' ? parent : join(root, destination);
    let error;
    try { await build(target); } catch (caught) { error = caught; }
    const exists = path => stat(path).then(info => info.isFile(), () => false);
    const sourcePresent = await exists(join(root, 'index.html'));
    const assetPresent = await exists(join(root, 'assets/favicon.svg'));
    const neighbourPresent = await exists(sentinel);
    t.diagnostic(JSON.stringify({ destination, error: error?.message, sourcePresent, assetPresent, neighbourPresent }));
    assert.ok(error, 'unsafe destination must be rejected');
    assert.equal(sourcePresent, true, 'source HTML must survive a rejected build');
    assert.equal(assetPresent, true, 'source assets must survive a rejected build');
    assert.equal(neighbourPresent, true, 'neighbouring files must survive a rejected build');
    assert.equal(await readFile(join(root, 'index.html'), 'utf8'), 'original public source: index.html');
  });
}

test('обычная повторная сборка очищает dist от посторонних файлов и сохраняет исходники', async t => {
  const { root, sentinel, build } = await fixture(t);
  const output = await build();
  await writeFile(join(output, '__qa.html'), 'temporary private test harness');
  await writeFile(join(output, '.env'), 'not a public resource');
  await build();
  const actual = (await readdir(output, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(output.length + 1)).sort();
  assert.deepEqual(actual, [...PUBLIC_FILES].sort());
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), 'original public source: index.html');
  assert.equal(await readFile(sentinel, 'utf8'), 'unrelated neighbouring file');
  t.diagnostic(JSON.stringify({ count: actual.length, hasQAPage: actual.includes('__qa.html'), hasEnv: actual.includes('.env'), sourcePreserved: true, neighbourPreserved: true }));
});
