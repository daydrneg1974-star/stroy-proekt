import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL as URLParser } from 'node:url';
import { renderContacts } from '../scripts/contacts.mjs';

const sourceHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const actualContacts = JSON.parse(await readFile(new URL('../contacts.json', import.meta.url), 'utf8'));
let loadNumber = 0;

// This is a controller fixture, not a browser or a layout/accessibility test.
// Nodes and initial form values come from the page; native events are supplied
// explicitly so unavailable platform APIs can be tested without a dependency.
async function page(t, { clipboard, exportError = false, contacts = actualContacts } = {}) {
  const html = renderContacts(sourceHtml, contacts);
  const eventHub = () => {
    const handlers = new Map();
    return {
      addEventListener(type, handler) {
        handlers.set(type, [...(handlers.get(type) || []), handler]);
      },
      async fire(type, event = {}) {
        for (const handler of handlers.get(type) || []) await handler({ target: this, ...event });
      },
    };
  };
  const document = { ...eventHub(), activeElement: null };
  const exports = [];
  const clicks = [];
  const timers = [];
  const revoked = [];
  const node = (tag, attrs = {}, offset = -1) => {
    const classes = new Set((attrs.class || '').split(/\s+/));
    return {
      ...eventHub(), tag, attrs, offset, textContent: '', value: attrs.value || '',
      checked: 'checked' in attrs, disabled: 'disabled' in attrs, hidden: 'hidden' in attrs,
      get href() { return this.attrs.href; },
      set href(value) { this.attrs.href = value; },
      dataset: Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
        .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
      style: { values: new Map(), setProperty(key, value) { this.values.set(key, value); } },
      classList: {
        add(value) { classes.add(value); },
        contains(value) { return classes.has(value); },
        toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
      },
      getAttribute(key) { return this.attrs[key] ?? null; },
      setAttribute(key, value) { this.attrs[key] = String(value); },
      focus() { document.activeElement = this; },
      select() { this.selectionStart = 0; this.selectionEnd = this.value.length; },
      closest(selector) { return selector === this.tag ? this : null; },
      getBoundingClientRect() { return { height: 76 }; },
      click() { clicks.push({ href: this.href, download: this.download }); },
      remove() {},
    };
  };
  const elements = [...html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)].map(match => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)]
      .map(([, key, value = '']) => [key, value]));
    return node(match[1], attrs, match.index);
  });
  const byId = id => elements.find(element => element.attrs.id === id);
  const header = elements.find(element => element.tag === 'header');
  header.contains = element => element.offset >= header.offset && element.offset < html.indexOf('</header>');
  const selected = name => elements.filter(element => element.tag === 'input' && element.attrs.name === name && element.checked);
  byId('calc').querySelector = selector => selected(selector.match(/name="([^"]+)"/)[1])[0];
  byId('calc').querySelectorAll = selector => selected(selector.match(/name="([^"]+)"/)[1]);
  document.documentElement = elements.find(element => element.tag === 'html');
  document.querySelector = selector => selector === 'header' ? header : byId(selector.slice(1));
  document.querySelectorAll = selector => elements.filter(element => selector.slice(1, -1) in element.attrs);
  document.createElement = tag => node(tag);
  document.body = { append() {} };
  const media = eventHub();
  const window = { ...eventHub(), matchMedia: () => media };
  const globals = {
    document, window, navigator: { clipboard },
    URL: {
      createObjectURL(blob) {
        if (exportError) throw new Error('Blob URLs unavailable');
        exports.push(blob);
        return `blob:test-${exports.length}`;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
  };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../site.js?controller-test=${++loadNumber}`);
  return {
    byId, document, window, media, exports, clicks, timers, revoked, elements,
    async choose(name, value) {
      const input = elements.find(element => element.attrs.name === name && element.value === value);
      assert.ok(input, `${name}=${value} exists in index.html`);
      if (input.attrs.type === 'radio') {
        for (const candidate of elements.filter(element => element.attrs.name === name)) candidate.checked = candidate === input;
      } else input.checked = !input.checked;
      await byId('calc').fire('input', { target: input });
    },
    async write(value) {
      byId('draft').value = value;
      await byId('draft').fire('input');
    },
  };
}

test('контроллер сохраняет отдельную инженерию при смене комплектации и переносит актуальные границы площади', async t => {
  const p = await page(t);
  assert.equal(p.byId('net').disabled, true);
  await p.choose('kit', 'shell');
  assert.equal(p.byId('net').checked, false);
  await p.choose('extras', 'engineering');
  await p.choose('kit', 'turnkey');
  assert.equal(p.byId('net').disabled, true);
  assert.equal((p.byId('project-summary').textContent.match(/инженерия/gi) || []).length, 1);
  await p.choose('kit', 'shell');
  assert.equal(p.byId('net').disabled, false);
  assert.equal(p.byId('net').checked, true);
  await p.choose('extras', 'engineering');
  await p.choose('kit', 'prepared');
  await p.choose('kit', 'shell');
  assert.equal(p.byId('net').checked, false);
  for (const area of ['60', '400']) {
    p.byId('area').value = area;
    await p.byId('calc').fire('input', { target: p.byId('area') });
    assert.equal(p.byId('areaOut').value, `${area} м²`);
    await p.byId('calcCta').fire('click');
    assert.ok(p.byId('draft').value.includes(`Площадь дома: ${area} м²`));
  }
  t.diagnostic(JSON.stringify({ engineeringChecked: p.byId('net').checked, areaOutput: p.byId('areaOut').value, draft: p.byId('draft').value }));
});

test('повтор переноса и карточки не стирает ручные записи и не добавляет второй такой же блок', async t => {
  const p = await page(t);
  const manual = '  Сохранить яблоню.\r\nПожелание: <script>не исполнять</script>\n';
  await p.write(manual);
  await p.byId('calcCta').fire('click');
  const first = p.byId('draft').value;
  assert.ok(first.startsWith(manual));
  await p.byId('calcCta').fire('click');
  assert.equal(p.byId('draft').value, first);
  const card = p.elements.find(element => element.dataset.topic);
  await card.fire('click');
  const withIdea = p.byId('draft').value;
  assert.ok(withIdea.startsWith(first));
  assert.ok(withIdea.endsWith(`Идея: ${card.dataset.topic}`));
  await card.fire('click');
  assert.equal(p.byId('draft').value, withIdea);
  assert.equal(p.byId('copy-draft').disabled, false);
  assert.equal(p.byId('download-draft').disabled, false);
  t.diagnostic(JSON.stringify({ manualPrefixPreserved: p.byId('draft').value.startsWith(manual), repeatsUnchanged: p.byId('draft').value === withIdea, draft: p.byId('draft').value }));
});

test('отсутствующий Clipboard выделяет весь черновик и сообщает реальную ошибку; очистка блокирует действия', async t => {
  const p = await page(t);
  const manual = 'Кириллица: ё, м².\n  Дополнение\n';
  await p.write(manual);
  await p.byId('copy-draft').fire('click');
  assert.equal(p.byId('draft').value, manual);
  assert.equal(p.document.activeElement, p.byId('draft'));
  assert.equal(p.byId('draft').selectionStart, 0);
  assert.equal(p.byId('draft').selectionEnd, manual.length);
  assert.match(p.byId('draft-status').textContent, /Не удалось скопировать автоматически/);
  assert.doesNotMatch(p.byId('draft-status').textContent, /Черновик скопирован/);
  t.diagnostic(JSON.stringify({ clipboard: 'absent', draft: p.byId('draft').value, selected: [p.byId('draft').selectionStart, p.byId('draft').selectionEnd], status: p.byId('draft-status').textContent }));
  await p.write(' \n ');
  assert.equal(p.byId('copy-draft').disabled, true);
  assert.equal(p.byId('download-draft').disabled, true);
  assert.equal(p.byId('draft-status').textContent, '');
});

test('отказ Clipboard не даёт ложного успеха, после повторной попытки копируется точный текущий текст', async t => {
  let fail = true;
  const writes = [];
  const p = await page(t, { clipboard: { async writeText(text) {
    if (fail) throw new Error('NotAllowedError');
    writes.push(text);
  } } });
  await p.write('Сохранить деревья.');
  await p.byId('copy-draft').fire('click');
  assert.match(p.byId('draft-status').textContent, /Не удалось/);
  fail = false;
  await p.write('Сохранить деревья.\nТерраса с южной стороны.');
  await p.byId('copy-draft').fire('click');
  assert.deepEqual(writes, [p.byId('draft').value]);
  assert.equal(p.byId('draft-status').textContent, 'Черновик скопирован.');
  t.diagnostic(JSON.stringify({ clipboard: 'recovered after rejection', writes, status: p.byId('draft-status').textContent }));
});

test('скачивание передаёт UTF-8 TXT с ручным текстом и освобождает Blob URL при повторах', async t => {
  const p = await page(t);
  const content = '../\n<script>alert(1)</script>\n=SUM(A1:A2)\nЁлка, м².';
  await p.write(content);
  for (let i = 0; i < 2; i++) await p.byId('download-draft').fire('click');
  assert.equal(p.exports.length, 2);
  for (const blob of p.exports) {
    assert.equal(blob.type, 'text/plain;charset=utf-8');
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(`\uFEFF${content}`, 'utf8'));
  }
  assert.deepEqual(p.clicks, [1, 2].map(i => ({ href: `blob:test-${i}`, download: 'stroyengineering-project.txt' })));
  assert.equal(p.byId('draft').value, content);
  for (const callback of p.timers) callback();
  assert.deepEqual(p.revoked, ['blob:test-1', 'blob:test-2']);
  t.diagnostic(JSON.stringify({ type: p.exports[0].type, utf8Bytes: Buffer.from(await p.exports[0].arrayBuffer()).toString('hex'), clicks: p.clicks, revoked: p.revoked }));
});

test('ошибка подготовки файла не теряет черновик и не выдаётся за успешное скачивание', async t => {
  const p = await page(t, { exportError: true });
  await p.write('Личный текст');
  await p.byId('download-draft').fire('click');
  assert.equal(p.byId('draft').value, 'Личный текст');
  assert.match(p.byId('draft-status').textContent, /Не удалось подготовить файл/);
  assert.equal(p.clicks.length, 0);
  t.diagnostic(JSON.stringify({ draft: p.byId('draft').value, downloads: p.clicks.length, status: p.byId('draft-status').textContent }));
});

test('пустая страница не предупреждает об уходе, ручной текст запрашивает предупреждение', async t => {
  const p = await page(t);
  let prevented = 0;
  await p.window.fire('beforeunload', { preventDefault() { prevented++; } });
  assert.equal(prevented, 0);
  await p.write('Несохранённая заметка');
  await p.window.fire('beforeunload', { preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(p.byId('draft').value, 'Несохранённая заметка');
  t.diagnostic(JSON.stringify({ beforeUnloadPrevented: prevented, draft: p.byId('draft').value }));
});

test('ссылки чатов неизменны после ввода, переноса, карточки и восстановления; переход не копирует текст', async t => {
  const writes = [];
  const p = await page(t, { clipboard: { async writeText(text) { writes.push(text); } } });
  const destinations = [
    ['open-whatsapp', 'https://wa.me/74991306616'],
  ];
  const assertDirectLinks = () => {
    for (const [id, base] of destinations) {
      const url = new URLParser(p.byId(id).href);
      assert.equal(url.href, base);
      assert.equal(url.hash, '');
      assert.equal(url.search, '');
    }
  };
  for (const [id, base] of destinations) assert.equal(p.byId(id).href, base);
  await p.write('  Тестовое имя, +7 999 000-00-00, условный адрес\nЯблоня & терраса + баня #1?\n&phone=79999999999\n😀');
  assertDirectLinks();
  await p.choose('kit', 'shell');
  await p.choose('extras', 'pond');
  await p.byId('calcCta').fire('click');
  assertDirectLinks();
  await p.elements.find(element => element.dataset.topic).fire('click');
  assertDirectLinks();
  p.byId('draft').value = 'Текст, восстановленный браузером\n';
  await p.window.fire('pageshow');
  assertDirectLinks();
  let prevented = false;
  p.byId('draft').value += 'Актуальное пожелание + # ? &';
  const beforeNavigation = p.byId('draft').value;
  for (const [id] of destinations) {
    for (const event of ['click', 'auxclick']) await p.byId(id).fire(event, { preventDefault() { prevented = true; } });
  }
  assertDirectLinks();
  assert.equal(p.byId('draft').value, beforeNavigation);
  assert.deepEqual(writes, [], 'Открытие чата не вызывает Clipboard');
  assert.equal(prevented, false, 'Переход остаётся обычным действием ссылки');
  assert.equal(p.clicks.length, 0, 'Контроллер не открывает чат самостоятельно');
  assert.doesNotMatch(p.byId('draft-status').textContent, /Заявка отправлена|доставлена/i);
  await p.write(' \n ');
  assertDirectLinks();
  t.diagnostic(JSON.stringify({ directChats: destinations.map(([id]) => p.byId(id).href), navigationPrevented: prevented }));
});

test('длинная заявка остаётся целой: подсказка, прямые чаты, полный Clipboard/TXT и ручное копирование при отказе', async t => {
  const writes = [];
  let fail = false;
  const p = await page(t, { clipboard: { async writeText(text) {
    if (fail) throw new Error('NotAllowedError');
    writes.push(text);
  } } });
  const draft = 'Пожелания: ёлка & терраса + баня #1?\n'.repeat(200);
  await p.write(draft);
  assert.equal(p.byId('draft').value, draft);
  assert.equal(p.byId('open-telegram'), undefined);
  assert.equal(p.byId('open-whatsapp').href, 'https://wa.me/74991306616');
  await p.byId('copy-draft').fire('click');
  assert.deepEqual(writes, [draft]);
  await p.byId('download-draft').fire('click');
  assert.deepEqual(Buffer.from(await p.exports[0].arrayBuffer()), Buffer.from(`\uFEFF${draft}`, 'utf8'));
  fail = true;
  await p.byId('copy-draft').fire('click');
  assert.equal(p.byId('draft').selectionStart, 0);
  assert.equal(p.byId('draft').selectionEnd, draft.length);
  assert.equal(p.byId('draft').value, draft);
  assert.match(p.byId('draft-status').textContent, /скопируйте его вручную/);
  await p.write('Короткая заявка после длинной');
  assert.equal(p.byId('open-whatsapp').href, 'https://wa.me/74991306616');
  assert.equal(p.byId('open-telegram'), undefined);
  t.diagnostic(JSON.stringify({ fullDraftLength: draft.length, copiedLength: writes[0].length, manualSelectionEnd: draft.length, shortenedDraftUsesDirectChat: true }));
});
