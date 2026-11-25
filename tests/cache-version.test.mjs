import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const sha256 = contents => createHash('sha256').update(contents).digest('hex');

test('сборка рассчитывает обе версии после нормализации текстовых файлов, исходники не меняются', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'stroy-cache-version-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = Object.fromEntries(await Promise.all(['index.html', 'site.js', 'project.js'].map(async name => [name, await readFile(new URL(`../${name}`, import.meta.url), 'utf8')])));
  const output = join(await build(temporary), 'public_html');
  const html = await readFile(join(output, 'index.html'), 'utf8');
  const site = await readFile(join(output, 'site.js'));
  const project = await readFile(join(output, 'project.js'));
  const entry = html.match(/<script\s+src="site\.js\?v=([a-f0-9]{64})"\s+type="module">/);
  const dependency = site.toString('utf8').match(/from ['"]\.\/project\.js\?v=([a-f0-9]{64})['"]/);
  assert.ok(entry, 'У entrypoint должен быть параметр v с SHA-256.');
  assert.ok(dependency, 'У импортируемого project.js должен быть параметр v с SHA-256.');
  assert.equal(dependency[1], sha256(project));
  assert.equal(entry[1], sha256(site));
  assert.equal(project.toString(), source['project.js'].replace(/\r\n?/g, '\n').trimEnd());
  for (const name of ['index.html', 'privacy.html', 'site.js', 'project.js', '.htaccess', 'robots.txt']) {
    const text = await readFile(join(output, name), 'utf8');
    assert.doesNotMatch(text, /\r|\s$/u, name);
  }
  for (const [name, before] of Object.entries(source)) {
    assert.equal(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'), before);
  }
});
