import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Независимый эталон: исходные цитаты из index.html коммита
// 75a6ee7c1a8a69022e3d8cc533c29a3986443420, подтверждённые владельцем в T03.
// Ожидаемые строки не извлекаются из текущего HTML.
const originalQuotes = [
  '«Нам было важно не собирать пять бригад. Здесь один инженер вёл и коробку, и отопление — вопросы решались в одном чате».',
  '«Калькулятор дал понятный порядок цифр ещё до встречи. В итоге смета по основным этапам совпала с договором».',
  '«Понравилась инженерная дисциплина: фото скрытых работ, испытания и понятная передача каждого этапа».',
];

test('три исходные цитаты клиентов сохранены дословно и в прежнем порядке', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const reviews = html.match(/<section\b[^>]*id="reviews"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(reviews, 'Раздел отзывов должен присутствовать.');
  const quotes = [...reviews.matchAll(/<blockquote\b[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/blockquote>/g)]
    .map(match => match[1]);
  assert.deepEqual(quotes, originalQuotes);
});
