import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDraft, copyDraft, createProject, createTextExport, describeProject, EXTRAS, KITS, WALLS } from '../project.js';

test('полный диапазон площади, все комплектации, материалы и опции дают актуальный состав', () => {
  for (let area = 60; area <= 400; area += 5) {
    for (const kit of Object.keys(KITS)) {
      for (const wall of Object.keys(WALLS)) {
        const project = createProject({ area: String(area), kit, wall, extras: Object.keys(EXTRAS) });
        const text = describeProject(project);
        assert.match(text, new RegExp(`Площадь дома: ${area} м²`));
        assert.ok(text.includes(KITS[kit]));
        assert.ok(text.includes(WALLS[wall]));
        for (const [key, label] of Object.entries(EXTRAS)) {
          if (key !== 'engineering' || kit === 'shell') assert.ok(text.includes(label));
        }
        assert.equal((text.toLowerCase().match(/инженерия/g) || []).length, 1);
      }
    }
  }
});

test('инженерия не дублируется, опции сохраняют порядок и не повторяются', () => {
  for (const kit of ['prepared', 'turnkey']) {
    const project = createProject({ area: 160, kit, wall: 'aerated', extras: ['pool', 'engineering', 'bath', 'pool'] });
    assert.deepEqual(project.extras, ['bath', 'pool']);
    assert.equal(project.includedEngineering, true);
  }
  const shell = createProject({ area: 60, kit: 'shell', wall: 'ceramic' });
  assert.equal(shell.includedEngineering, false);
  assert.match(describeProject(shell), /Дополнительно: не выбрано/);
});

test('невалидные площадь, комплектация и материал не превращаются в состав', () => {
  const valid = { area: 160, kit: 'shell', wall: 'aerated' };
  for (const area of [0, 59, 61, 160.5, 401, Infinity, 'не число']) assert.throws(() => createProject({ ...valid, area }), RangeError);
  assert.throws(() => createProject({ ...valid, kit: '__proto__' }), RangeError);
  assert.throws(() => createProject({ ...valid, wall: '<script>' }), RangeError);
  assert.deepEqual(createProject({ ...valid, extras: ['<script>', 'gas'] }).extras, ['gas']);
});

test('перенос и карточки сохраняют ручные записи, новый состав добавляется, повтор не размножается', () => {
  const manual = 'Моя заметка: сохранить деревья.  \nНе менять планировку.\n';
  const first = describeProject(createProject({ area: 160, kit: 'shell', wall: 'aerated' }));
  const second = describeProject(createProject({ area: 400, kit: 'turnkey', wall: 'ceramic', extras: ['pond'] }));
  const initial = appendDraft(manual, first);
  assert.ok(initial.text.startsWith(manual));
  assert.equal(initial.added, true);
  assert.deepEqual(appendDraft(initial.text, first), { text: initial.text, added: false });
  const updated = appendDraft(initial.text, second);
  assert.ok(updated.text.startsWith(initial.text));
  assert.ok(updated.text.endsWith(second));
  const idea = appendDraft(updated.text, 'Идея: Ландшафтный дизайн');
  assert.ok(idea.text.startsWith(updated.text));
  assert.deepEqual(appendDraft(idea.text, 'Идея: Ландшафтный дизайн'), { text: idea.text, added: false });
  assert.equal(appendDraft('', first).text, first);
});

test('экспорт — UTF-8 TXT с фиксированным именем, любой пользовательский текст остаётся текстом', () => {
  const content = '../данные\n<script>alert("x")</script>\n=SUM(A1:A2)\nКириллица: ё, м².';
  const file = createTextExport(content);
  assert.equal(file.filename, 'stroyengineering-project.txt');
  assert.equal(file.type, 'text/plain;charset=utf-8');
  assert.equal(file.content, '\uFEFF' + content);
  assert.throws(() => createTextExport(' \n '), RangeError);
});

test('копирование передаёт точный текст и сообщает ошибки разрешений или недоступного API', async () => {
  const content = 'Ручная заметка\nСостав проекта';
  let copied;
  await copyDraft(content, { writeText: async text => { copied = text; } });
  assert.equal(copied, content);
  await assert.rejects(copyDraft(content, undefined), /недоступно/);
  await assert.rejects(copyDraft(content, { writeText: async () => { throw new Error('denied'); } }), /denied/);
  await assert.rejects(copyDraft('', { writeText: async () => {} }), /пуст/);
});

test('без переноса через URL копирование и TXT сохраняют полный текст независимо от длины и символов', async () => {
  for (const content of ['  Ёлка & терраса + баня #1?\n😀\n', 'Ручные пожелания\r\n'.repeat(2000), '\ud800']) {
    const writes = [];
    await copyDraft(content, { writeText: async text => { writes.push(text); } });
    assert.deepEqual(writes, [content]);
    assert.equal(createTextExport(content).content, '\uFEFF' + content);
  }
});
