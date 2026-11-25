import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderContacts, validateContacts } from '../scripts/contacts.mjs';

test('неуказанные каналы не создают кнопок или инструкций; один и два канала дают прямые ссылки', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
  for (const contacts of [
    { whatsapp: null, telegram: null },
    { whatsapp: 'https://wa.me/74991306616', telegram: null },
    { whatsapp: null, telegram: 'https://t.me/example_contact' },
    { whatsapp: 'https://wa.me/74991306616', telegram: 'https://t.me/example_contact' },
  ]) {
    const html = renderContacts(index, contacts);
    const data = renderContacts(privacy, contacts);
    assert.doesNotMatch(html + data, /\{\{[A-Z_]+\}\}|t\.me\/\+7499|аккаунт.*не подтвержд/);
    assert.match(html, /href="tel:\+74991306616"/);
    for (const [service, label] of [['whatsapp', 'WhatsApp'], ['telegram', 'Telegram']]) {
      if (contacts[service]) {
        assert.ok(html.includes(`href="${contacts[service]}"`));
        assert.ok(html.includes(`Открыть ${label}`));
        assert.ok(data.includes(`Политика конфиденциальности ${label}`));
        assert.equal(new URL(contacts[service]).search, '');
        assert.equal(new URL(contacts[service]).hash, '');
      } else {
        assert.ok(!html.includes(`id="open-${service}"`));
        assert.ok(!html.includes(label));
        assert.ok(!data.includes(label));
      }
    }
  }
});

test('конфигурация отклоняет текст в URL, чужие адреса и городской Telegram', () => {
  for (const contacts of [
    { whatsapp: 'https://wa.me/74991306616?text=draft', telegram: null },
    { whatsapp: 'https://wa.me/74991306616#draft', telegram: null },
    { whatsapp: 'https://example.org/74991306616', telegram: null },
    { whatsapp: null, telegram: 'https://t.me/+74991306616' },
    { whatsapp: null, telegram: 'https://t.me/example_contact?text=draft' },
    { whatsapp: '', telegram: null },
  ]) assert.throws(() => validateContacts(contacts));
  assert.deepEqual(validateContacts({ whatsapp: null, telegram: 'https://t.me/+79990000000' }), { whatsapp: null, telegram: 'https://t.me/+79990000000' });
});
