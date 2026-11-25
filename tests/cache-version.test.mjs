import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sha256 = contents => createHash('sha256').update(contents).digest('hex');

test('версии entrypoint и зависимого модуля равны SHA-256 их фактического содержимого', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const site = await readFile(new URL('../site.js', import.meta.url));
  const project = await readFile(new URL('../project.js', import.meta.url));
  const entry = html.match(/<script\s+src="site\.js\?v=([a-f0-9]{64})"\s+type="module">/);
  const dependency = site.toString('utf8').match(/from ['"]\.\/project\.js\?v=([a-f0-9]{64})['"]/);
  assert.ok(entry, 'У entrypoint должен быть параметр v с SHA-256.');
  assert.ok(dependency, 'У импортируемого project.js должен быть параметр v с SHA-256.');
  assert.equal(dependency[1], sha256(project), 'Обновите версию project.js в импорте, затем версию site.js в HTML.');
  assert.equal(entry[1], sha256(site), 'Обновите версию site.js в HTML после изменения контроллера.');
});
