// Recheck saved browser downloads; does not launch a browser or contact a server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const composition = 'Состав проекта\nПлощадь дома: 400 м²\nКомплектация: Коробка: фундамент, стены, кровля\nМатериал стен: Керамоблок 38\nДополнительно: Декоративный пруд\nСтоимость и сроки не рассчитаны.\nПредварительный список пожеланий, не смета и не договор.';
const longText = '  Проверка T07: сохранить яблоню, ёлку и дорожку. 🏡 & ? #\n\n'
  + Array.from({ length: 1000 }, (_, i) => `${i + 1}. Общие пожелания без персональных данных: вода, свет, терраса.\n`).join('')
  + '  Конец заметок  \n\n' + composition;
const shortText = '  После сброса: терраса, ёлка 🏡\nВторая строка.  \n';
const cases = [
  ['long-after-reset.txt', longText, '38b71ffc811958d515f0946483e55fd7e4d8c06d515a808fece8ba1b584b3e50'],
  ['short.txt', shortText, '8e1a79b45ebda4eacf154a81b63eda454d503885fa45be27376905a923694a11'],
  ['short-edited.txt', shortText + 'Дополнение после первого скачивания: навес.\n', '82026d43e3a3f3a321752a06fd8fd0eb2b76365dc88ac3abbaf817fa8fdf0c02'],
];
for (const [file, expected, expectedSha256] of cases) {
  const bytes = await readFile(new URL(file, import.meta.url));
  assert.deepEqual(bytes, Buffer.from('\uFEFF' + expected, 'utf8'), file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedSha256, file);
  console.log(`${file}: PASS, ${bytes.length} bytes, ${expected.length} UTF-16 units`);
}
