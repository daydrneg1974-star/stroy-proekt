import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, validateBuildDestination } from './build.mjs';
import { apacheConfig } from './build-spaceweb.mjs';
import { PUBLIC_FILES } from './public-files.mjs';

// Публикация демонстрации в корне домена, без направления заявок подрядчику.
// Исходный вариант для Sites и проверочная копия сохраняются.
if (!process.argv[2]) throw new Error('Укажите новый пустой каталог сборки.');
const destination = await validateBuildDestination(process.argv[2]);
const output = resolve(destination, 'public_html');
await mkdir(destination, { recursive: true });
await build(output);

function once(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Исходный фрагмент изменился: ${before.slice(0,90)}`);
  return text.replace(before, after);
}
const origin = 'https://stroyinzh-dom.ru';
const previous = 'https://stroyengineering-demo-rifkat.daydrneg1974.chatgpt.site';
let html = (await readFile(resolve(output, 'index.html'), 'utf8')).replaceAll(previous, origin);
html = once(html, 'Подготовьте состав проекта дома и участка и отправьте его в Telegram или WhatsApp. Без расчёта цены.', 'Соберите состав проекта дома и участка и сохраните его на устройстве. Без расчёта цены и приёма заявок.');
html = once(html, 'Подготовьте состав проекта и отправьте его в Telegram или WhatsApp. Демоверсия без расчёта цены.', 'Соберите и сохраните состав проекта. Демонстрационная версия без приёма заявок.');
html = once(html, 'Генподряд, Москва и Московская область', 'Демонстрационный проект · Подмосковье');
html = once(html, '<a href="#contact">Контакты</a>', '<a href="#contact">Черновик</a>');
html = once(html, 'Демоверсия · без расчёта цены', 'Демоверсия · без расчёта цены и приёма заявок');
html = once(html, '>Обсудить проект</a>', '>Сохранить идею</a>');
html = once(html, 'Добавьте его в черновик, чтобы отправить в выбранном мессенджере.', 'Добавьте его в черновик и сохраните на своём устройстве.');
html = once(html, '<h2>Отзывы клиентов</h2>', '<h2>Отзывы клиентов</h2><p class="note">Текущий конфигуратор помогает выбрать состав работ и не рассчитывает стоимость.</p>');
html = html.replace(/<details><summary>Как вызвать инженера на участок\?<\/summary>[\s\S]*?<\/details>/, '<details><summary>Можно ли отправить заявку с сайта?</summary><p>Сейчас доступна демонстрационная версия. Вы можете составить описание проекта и сохранить его у себя. Приём заявок и контакты исполнителя будут добавлены после оформления информации о компании и обработке данных.</p></details>');
html = once(html, '<h2>Обсудим ваш проект</h2>', '<h2>Сохраните ваш проект</h2>');
html = html.replace(/<p class="lead">Подготовьте состав работ и пожелания\.[\s\S]*?<\/dl>/, '<p class="lead">Выберите состав работ и запишите пожелания. Скопируйте текст или скачайте файл, чтобы вернуться к идее позже.</p><p>Демонстрационная версия не принимает заявки. Договоры и оплата через сайт не оформляются.</p><dl><dt>Направление проекта</dt><dd>Дома и участки в Москве и Московской области</dd></dl>');
html = once(html, 'Черновик заявки</label>', 'Черновик проекта</label>');
html = once(html, 'О технических данных при загрузке сайта и переходе в мессенджеры', 'О технических данных при загрузке сайта');
html = html.replace(/\s*<ol class="note messenger-steps"[\s\S]*?<\/ol>/, '');
html = html.replace(/\s*<div class="draft-actions" role="group" aria-label="Выберите мессенджер">[\s\S]*?<\/div>/, '');
html = html.replace(/\s*<p class="note">Ссылки открывают чат без текста\.[\s\S]*?<\/p>/, '');
html = html.replace(/<noscript><p class="note">JavaScript отключён:[\s\S]*?<\/noscript>/, '<noscript><p class="note">JavaScript отключён. Запишите состав проекта и скопируйте его вручную. Автоматическое копирование и скачивание TXT недоступны.</p></noscript>');
html = once(html, '<div>Контакты<br><a href="tel:+74991306616">+7 (499) 130-66-16</a></div>', '<div>Демонстрационная версия<br>Приём заявок пока не открыт</div>');
html = html.replace(/<section id="privacy">[\s\S]*?<\/section>/, '<section id="privacy"><div class="wrap"><h2>Данные в демоверсии</h2><p>Черновик остаётся в памяти вкладки. Копирование и скачивание сохраняют текст только на вашем устройстве. В коде сайта нет приёма заявок, аналитики и рекламных cookies.</p><p>Страницы размещены на SpaceWeb. При загрузке файлов хостинг получает IP-адрес и технические параметры запроса. В панели отключены журналы посещений, ошибок и AWStats; служебные журналы провайдера этим не исключаются.</p><p>Подробнее — <a href="privacy.html">«Данные и конфиденциальность»</a>. Сайт демонстрирует проект; сведения об исполнителе и окончательная политика ещё оформляются.</p></div></section>');
html = html.replace(/<a class="btn sm" href="tel:\+74991306616"[^>]*>Позвонить<\/a>/, '<a class="btn sm" href="#contact">Мой черновик</a>');

// Редактор SpaceWeb убирает завершающие переводы строк. Нормализуем именно
// редактируемые файлы до расчёта хешей, чтобы манифест описывал реальные байты.
const script = (await readFile(resolve(output, 'site.js'), 'utf8')).trimEnd();
await writeFile(resolve(output, 'site.js'), script);
const scriptHash = createHash('sha256').update(script).digest('hex');
html = html.replace(/site\.js\?v=[a-f0-9]{64}/, `site.js?v=${scriptHash}`);
if (/tel:|wa\.me|t\.me|Открыть Telegram|Открыть WhatsApp|подготовьте заявку/.test(html)) throw new Error('В публичной демонстрации остался приём обращений.');
html = once(html, '<meta property="og:image" content="assets/image-1.webp">',
  `<meta property="og:image" content="${origin}/assets/image-1.webp">`);
await writeFile(resolve(output, 'index.html'), html.trimEnd());

let privacy = (await readFile(resolve(output, 'privacy.html'), 'utf8')).replaceAll(previous, origin);
privacy = once(privacy, 'копирование, скачивание и ссылки мессенджеров', 'копирование и скачивание');
privacy = privacy.replaceAll('22 ноября 2026 года', '23 ноября 2026 года');
privacy = privacy.replace(/<a class="phone" href="tel:[^"]+">[^<]*<\/a>/g, '');
privacy = privacy.replace(/ <h2>Telegram и WhatsApp<\/h2>[\s\S]*? <h2>Технические данные и cookies<\/h2>/, ' <h2>Приём обращений</h2>\n <p>В этой демонстрационной версии отключены переходы к чатам подрядчика и приём заявок. Черновик можно сохранить на своём устройстве. Сайт не принимает платежи и не оформляет договоры.</p>\n\n <h2>Технические данные и cookies</h2>');
privacy = privacy.replace(/ <p>При проверке публичного сайта[\s\S]*?<\/p>/, ' <p>Сайт размещён на виртуальном хостинге SpaceWeb. По состоянию на 23 ноября 2026 года в панели для stroyinzh-dom.ru отключены журналы посещений, ошибок и AWStats. Это не подтверждает отсутствие служебных журналов провайдера. В <a href="https://help.sweb.ru/kak-posmotret6-logi_42.html" target="_blank" rel="noopener noreferrer">документации SpaceWeb</a> указан общий срок хранения журналов 30 дней; применимость этого срока к каждому виду служебных данных отдельно не подтверждена.</p>');
privacy = once(privacy, 'Из локальной работы черновика и ручной отправки в мессенджере', 'Из локальной работы черновика');
privacy = privacy.replace(/ <h2>Связь<\/h2>[\s\S]*? <a class="back" href="index.html#privacy">/, ' <h2>Статус демонстрации</h2>\n <p>Сведения о фактическом исполнителе, операторе персональных данных и порядке обращений будут опубликованы после их подтверждения. До этого сайт используется для демонстрации проекта без приёма заявок.</p>\n <a class="back" href="index.html#privacy">');
if (/tel:|t\.me|wa\.me|__cf_bm|Telegram|WhatsApp/.test(privacy)) throw new Error('Осталось описание прежних контактов или хостинга.');
await writeFile(resolve(output, 'privacy.html'), privacy.trimEnd());
await writeFile(resolve(output, '.htaccess'), apacheConfig.trimEnd());
await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
const files = [];
for (const name of [...PUBLIC_FILES, '.htaccess', 'robots.txt']) {
  const bytes = await readFile(resolve(output, name));
  files.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(resolve(destination, 'release-manifest.json'), JSON.stringify({ origin, mode: 'public-demo-no-inquiries', files }, null, 2) + '\n');
console.log(JSON.stringify({ output, publicFiles: files.length, scriptHash }));
