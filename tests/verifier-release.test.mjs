import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function snapshot(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const rows = await Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const filename = join(entry.parentPath, entry.name);
    return [relative(directory, filename), sha256(await readFile(filename))];
  }));
  return Object.fromEntries(rows.sort(([a], [b]) => a.localeCompare(b)));
}
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'stroy-independent-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, 'source');
  await mkdir(source);
  for (const name of ['scripts', 'assets', 'server', 'styles.css', 'privacy.css', 'navigation.js', 'request.php', 'request.js', 'request.css', 'index.html', 'privacy.html', 'project.js', 'site.js', '.htaccess', 'robots.txt', 'contacts.json', 'package.json']) {
    await cp(join(project, name), join(source, name), { recursive: true });
  }
  const run = (...args) => spawnSync(process.execPath, args, { cwd: source, encoding: 'utf8' });
  return { temporary, source, run };
}

test('CLI: загрязнённые исходники не текут в релиз; CRLF и повторы воспроизводимы; нарушение байтов/состава обнаруживается', async t => {
  const { temporary, source, run } = await fixture(t);
  await mkdir(join(source, 'docs'));
  for (const name of ['.env', 'private-backup.zip', 'README.md', 'assets/private.txt', 'docs/note.txt', 'server/config.php', 'server/debug.log']) {
    await writeFile(join(source, name), 'VERIFIER_PRIVATE_CANARY_MUST_NEVER_BE_PUBLISHED');
  }
  const before = await snapshot(source);
  const release = join(temporary, 'release-one');
  const first = run('scripts/build.mjs', release);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(await snapshot(source), before, 'build must not rewrite any source, contact configuration or canary');
  const privateFiles = await snapshot(join(release,'private'));
  assert.equal(Object.keys(privateFiles).length, 11);
  assert.ok(!Object.keys(privateFiles).includes('config.php'));
  assert.ok(!Object.keys(privateFiles).includes('debug.log'));
  const published = await snapshot(join(release, 'public_html'));
  assert.equal(Object.keys(published).length, 32);
  assert.equal(Object.keys(published).filter(name => name.startsWith('assets/')).length, 20);
  assert.deepEqual(Object.keys(published).filter(name => !name.startsWith('assets/')).sort(), ['.htaccess', 'index.html', 'navigation.js', 'privacy.css', 'privacy.html', 'project.js', 'request.css', 'request.js', 'request.php', 'robots.txt', 'site.js', 'styles.css']);
  for (const name of Object.keys(published)) {
    assert.equal((await readFile(join(release, 'public_html', name))).includes('VERIFIER_PRIVATE_CANARY'), false, name);
  }
  assert.equal(run('scripts/verify-release.mjs', release).status, 0);
  for (const name of ['index.html', 'privacy.html', 'project.js', 'site.js', '.htaccess', 'robots.txt']) {
    const original = await readFile(join(source, name), 'utf8');
    await writeFile(join(source, name), original.replace(/\r?\n/g, '\r\n') + '\r\n \t\r\n');
  }
  const secondRelease = join(temporary, 'release-two');
  const second = run('scripts/build.mjs', secondRelease);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(await snapshot(secondRelease), await snapshot(release), 'normalizing CRLF and terminal editor whitespace must preserve every deployed byte and manifest');
  const manifest = JSON.parse(await readFile(join(release, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.origin, 'https://stroyinzh-dom.ru');
  const validReleaseSha256 = sha256(await readFile(join(release, 'release-manifest.json')));
  const siteFile = join(release, 'public_html/site.js');
  const validSite = await readFile(siteFile);
  const corrupted = Buffer.from(validSite);
  corrupted[0] ^= 1; // same byte length; a size-only verifier must not pass
  await writeFile(siteFile, corrupted);
  const corruptedResult = run('scripts/verify-release.mjs', release);
  assert.notEqual(corruptedResult.status, 0);
  assert.match(corruptedResult.stderr, /SHA-256 site\.js/);
  await writeFile(siteFile, validSite);
  await writeFile(join(release, 'public_html/private-backup.zip'), 'PRIVATE_CANARY');
  const extraResult = run('scripts/verify-release.mjs', release);
  assert.notEqual(extraResult.status, 0);
  assert.match(extraResult.stderr, /allowlist/);
  t.diagnostic(JSON.stringify({ files: Object.keys(published), sourceUnchanged: true, canariesPublished: false, crlfReleaseIdentical: true, manifestSha256: validReleaseSha256, sameLengthTamperRejected: true, extraArchiveRejected: true }));
});

test('CLI: ошибка входных данных и симлинк назначения не уничтожают последний релиз или соседние файлы', async t => {
  const { temporary, source, run } = await fixture(t);
  const first = run('scripts/build.mjs');
  assert.equal(first.status, 0, first.stderr);
  const goodRelease = await snapshot(join(source, 'dist'));
  await writeFile(join(source, 'contacts.json'), '{"whatsapp":"https://wa.me/74991306616?text=SECRET","telegram":null}');
  const invalid = run('scripts/build.mjs');
  assert.notEqual(invalid.status, 0);
  assert.deepEqual(await snapshot(join(source, 'dist')), goodRelease, 'reject invalid contacts before clearing the last good dist');
  await cp(join(project, 'contacts.json'), join(source, 'contacts.json'));
  await rm(join(source, 'project.js'));
  const missing = run('scripts/build.mjs');
  assert.notEqual(missing.status, 0);
  assert.deepEqual(await snapshot(join(source, 'dist')), goodRelease, 'missing input must not clear the last good dist');
  await cp(join(project, 'project.js'), join(source, 'project.js'));
  const unrelated = join(temporary, 'unrelated');
  await mkdir(unrelated);
  await writeFile(join(unrelated, 'important.txt'), 'NEIGHBOUR_MUST_SURVIVE');
  const alias = join(temporary, 'alias');
  await symlink(unrelated, alias, 'dir');
  const redirected = run('scripts/build.mjs', join(alias, 'new-release'));
  assert.notEqual(redirected.status, 0);
  assert.equal(await readFile(join(unrelated, 'important.txt'), 'utf8'), 'NEIGHBOUR_MUST_SURVIVE');
  assert.deepEqual(await readdir(unrelated), ['important.txt']);
  t.diagnostic(JSON.stringify({ invalidContactsRejectedBeforeDeletion: true, missingSourceRejectedBeforeDeletion: true, symlinkAncestorRejected: true, unrelatedDirectoryUntouched: true, lastGoodReleaseUnchanged: true }));
});
