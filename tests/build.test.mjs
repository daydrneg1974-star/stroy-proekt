import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { build, ROOT, validateBuildDestination } from '../scripts/build.mjs';
import { PUBLIC_FILES } from '../scripts/public-files.mjs';
import { renderContacts } from '../scripts/contacts.mjs';

const contacts = JSON.parse(await readFile(join(ROOT, 'contacts.json'), 'utf8'));
const readPage = async name => renderContacts(await readFile(join(ROOT, name), 'utf8'), contacts);

test('сборка воспроизводима в новых и пустых каталогах, публикуется только allowlist', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'stroyengineering-build-'));
  try {
    const firstRelease = await build(join(temporary, 'one'));
    const first = join(firstRelease, 'public_html');
    await mkdir(join(temporary, 'two'));
    const secondRelease = await build(join(temporary, 'two'));
    const second = join(secondRelease, 'public_html');
    const actual = (await readdir(first, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name).slice(first.length + 1));
    assert.deepEqual(actual.sort(), [...PUBLIC_FILES].sort());
    for (const name of PUBLIC_FILES) {
      const hash = async directory => createHash('sha256').update(await readFile(join(directory, name))).digest('hex');
      assert.equal(await hash(first), await hash(second), name);
    }
    assert.equal(await readFile(join(firstRelease, 'release-manifest.json'), 'utf8'), await readFile(join(secondRelease, 'release-manifest.json'), 'utf8'));
    assert.deepEqual((await readdir(firstRelease)).sort(), ['private', 'public_html', 'release-manifest.json']);
    assert.ok(!actual.some(name => /(?:\.env|app\.php|bootstrap\.php|config\.php|README|docs\/)/.test(name)));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('корень проекта и корень файловой системы отклоняются до любых операций сборки', async () => {
  // Вызывается только валидация: даже её регрессия не запустит rm на исходниках.
  for (const path of [ROOT, parse(ROOT).root]) {
    await assert.rejects(validateBuildDestination(path), /исходники или их родительский каталог/);
  }
  assert.equal(await validateBuildDestination(join(ROOT, 'dist')), join(ROOT, 'dist'));
});

test('внешний непустой каталог и симлинк отклоняются, чужой текст остаётся цел', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'stroyengineering-output-'));
  try {
    const sentinel = join(temporary, '.keep');
    await writeFile(sentinel, 'do not overwrite');
    await assert.rejects(build(temporary), /пустой или новый каталог/);
    assert.equal(await readFile(sentinel, 'utf8'), 'do not overwrite');
    const link = join(temporary, 'linked-output');
    await symlink(temporary, link, 'dir');
    await assert.rejects(build(link), /файлом или символической ссылкой/);
    assert.deepEqual((await readdir(temporary)).sort(), ['.keep', 'linked-output']);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('каждая локальная ссылка, картинка, srcset и импорт имеют цель, лишних публичных файлов нет', async () => {
  const used = new Set(['index.html', '.htaccess', 'robots.txt', 'request.php', 'request.css', 'request.js']);
  for (const page of PUBLIC_FILES.filter(name => name.endsWith('.html'))) {
    const html = await readPage(page);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `id должны быть уникальны: ${page}`);
    for (const [, reference] of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
      if (reference.startsWith('#')) assert.ok(ids.includes(reference.slice(1)), reference);
      else if (/^https?:/.test(reference)) {
        assert.ok([
          'https://stroyinzh-dom.ru/',
          'https://stroyinzh-dom.ru/privacy.html',
          'https://wa.me/74991306616',
          'https://telegram.org/privacy',
          'https://www.whatsapp.com/legal/privacy-policy',
        ].includes(reference), reference);
      }
      else if (reference.startsWith('tel:')) {
        assert.equal(reference, 'tel:+74991306616');
      }
      else {
        const path = reference.split(/[?#]/)[0];
        assert.ok(PUBLIC_FILES.includes(path), reference);
        used.add(path);
        if (reference.includes('#')) {
          const target = await readPage(path);
          assert.ok(target.includes(`id="${reference.split('#')[1]}"`), reference);
        }
      }
    }
    for (const [, srcset] of html.matchAll(/\bsrcset="([^"]+)"/g)) {
      for (const item of srcset.split(',')) {
        const reference = item.trim().split(/\s+/)[0];
        assert.ok(PUBLIC_FILES.includes(reference), reference);
        used.add(reference);
      }
    }
    for (const [image] of html.matchAll(/<img\b[^>]+>/g)) {
      assert.match(image, /width="\d+"/);
      assert.match(image, /height="\d+"/);
      assert.match(image, /srcset=/);
    }
  }
  const script = await readFile(join(ROOT, 'site.js'), 'utf8');
  for (const [, reference] of script.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) {
    const path = reference.split(/[?#]/)[0];
    assert.ok(PUBLIC_FILES.includes(path), reference);
    used.add(path);
  }
  assert.deepEqual([...used].sort(), [...PUBLIC_FILES].sort());
});

test('главная не собирает контакты, не отправляет данные через API и не создаёт скрытое хранилище', async () => {
  const html = await readPage('index.html');
  const script = await readFile(join(ROOT, 'site.js'), 'utf8');
  const model = await readFile(join(ROOT, 'project.js'), 'utf8');
  assert.doesNotMatch(html, /<form\b|type="(?:email|tel)"|autocomplete="(?:name|tel|email)"/);
  const interfaceHtml = html.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/g, '');
  assert.doesNotMatch(interfaceHtml, /Рассчитать смету|Калькулятор/);
  assert.doesNotMatch(html, /fonts\.googleapis|preconnect/);
  assert.doesNotMatch(script + model, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML\s*=|\.readText\s*\(/);
  assert.match(html, /<title>[^<]*строительство домов/i);
  assert.doesNotMatch(html, /демоверси/i);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<meta property="og:title"[^>]*дом и участок/i);
  assert.match(html, /<video\b[^>]*preload="none"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /id="navigation"/);
  assert.match(html, /data-js-only hidden/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<textarea\b[^>]*spellcheck="false"/);
  assert.ok(html.includes('Предварительный') || html.includes('предварительный'));
});

test('без JavaScript доступны подтверждённый WhatsApp и ручное копирование; ссылка безопасно открывается отдельно', async () => {
  const html = await readPage('index.html');
  for (const [id, href] of [
    ['open-whatsapp', 'https://wa.me/74991306616'],
  ]) {
    const anchor = html.match(new RegExp(`<a\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(anchor, id);
    assert.ok(anchor.includes(`href="${href}"`));
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
    assert.match(anchor, /aria-describedby="messenger-help messenger-recipient"/);
    assert.doesNotMatch(anchor, /\bhidden\b|data-js-only|download=/);
  }
  const noScript = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(match => match[1]).join('\n');
  assert.match(noScript, /ссылки открывают чат без текста/);
  assert.match(noScript, /скопируйте его вручную/);
  const steps = html.match(/<ol\b[^>]*id="messenger-help"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(steps);
  assert.match(steps, /Скопируйте текст целиком[\s\S]*Откройте WhatsApp[\s\S]*Вставьте текст[\s\S]*«Отправить»/);
  assert.equal([...steps.matchAll(/<li>/g)].length, 3);
  assert.ok(html.indexOf('id="copy-draft"') < html.indexOf('id="open-whatsapp"'), 'Копирование показано перед открытием чата');
  assert.match(html, /<dt>Исполнитель<\/dt><dd>СтройИнжиниринг<\/dd>/);
  assert.match(html, /Получатель: СтройИнжиниринг\./);
  assert.doesNotMatch(html, /Telegram|аккаунт.*не подтвержд|ожида.*владельц/);
  assert.doesNotMatch(html, /mailto:|type="email"/);
  assert.doesNotMatch(html, /MAX|Заявка отправлена|Онлайн-отправка заявок пока не подключена|без расчёта цены и отправки заявок/);
});

test('информация о данных доступна без JS из контактов и подвала, публичная страница не обещает юридическую готовность', async () => {
  const html = await readPage('index.html');
  const privacy = await readPage('privacy.html');
  const contact = html.match(/<section id="contact"[\s\S]*?<\/section>/)?.[0];
  const footer = html.slice(html.indexOf('</main>')).match(/<footer>[\s\S]*?<\/footer>/)?.[0];
  for (const section of [contact, footer]) {
    assert.ok(section);
    assert.match(section, /<a\b[^>]*href="privacy\.html"[^>]*>[^<]*Данные и конфиденциальность/);
  }
  assert.match(html, /id="privacy"/);
  assert.match(contact, /Не указывайте ФИО, телефон, точный адрес, данные документов/);
  assert.match(privacy, /<h1>Данные и конфиденциальность<\/h1>/);
  assert.match(privacy, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(privacy, /<meta name="referrer" content="no-referrer">/);
  assert.match(privacy, /href="index\.html#contact"/);
  assert.match(privacy, /href="tel:\+74991306616"/);
  assert.doesNotMatch(privacy, /<script\b|<form\b|<iframe\b|data-js-only|\bhidden\b/);
  assert.match(privacy, /памяти открытой вкладки/);
  assert.match(privacy, /IP-адрес/);
  assert.match(privacy, /SpaceWeb/);
  assert.match(privacy, /При проверке 23 ноября 2026 года[\s\S]*были отключены журналы посещений, ошибок и AWStats/);
  assert.doesNotMatch(html + privacy, /__cf_bm|Cloudflare|chatgpt\.site/);
  assert.match(privacy, /реквизитами оператора будет опубликована после их подтверждения/);
  assert.match(privacy, /не подтверждает полное соответствие/);
  assert.match(privacy, /Сроки хранения технических данных[\s\S]*отдельно не подтверждены/);
  for (const anchor of privacy.matchAll(/<a\b[^>]*href="https:[^"]+"[^>]*>/g)) {
    assert.match(anchor[0], /target="_blank"/);
    assert.match(anchor[0], /rel="noopener noreferrer"/);
  }
});
