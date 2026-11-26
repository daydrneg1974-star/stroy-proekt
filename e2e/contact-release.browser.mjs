import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Browser checks are explicit: npm run e2e. Missing Playwright/Chromium is an
// error, never a passing or silently skipped browser check. No external network.
const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = resolve(process.env.STROY_E2E_ARTIFACTS || join(root, 'docs/tasks/artifacts/T07'));
const evidence = { browser: '', localOnly: true, tests: [] };
const sha256 = value => createHash('sha256').update(value).digest('hex');
let browser, server, release, origin;

async function loadPlaywright() {
  if (process.env.STROY_PLAYWRIGHT_MODULE) return import(pathToFileURL(process.env.STROY_PLAYWRIGHT_MODULE));
  if (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) {
    return import(pathToFileURL(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.js')));
  }
  return import('playwright');
}

before(async () => {
  await mkdir(join(artifacts, 'screenshots'), { recursive: true });
  const imported = await loadPlaywright();
  const { chromium } = imported.default || imported;
  release = await mkdtemp(join(tmpdir(), 'stroy-browser-release-'));
  execFileSync(process.execPath, ['scripts/build.mjs', release], { cwd: root });
  const publicRoot = join(release, 'public_html');
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(publicRoot + '/') || !(await stat(filename)).isFile()) {
        response.writeHead(404).end(); return;
      }
      const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8' };
      response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream' });
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
  origin = `http://127.0.0.1:${server.address().port}`;
  let executablePath = process.env.STROY_CHROMIUM_PATH;
  if (!executablePath) {
    // A distro launcher can exist without its binary. Check the actual binary;
    // otherwise let Playwright resolve its installed headless browser.
    try { await access('/usr/lib/chromium/chromium'); executablePath = '/usr/lib/chromium/chromium'; } catch { /* use Playwright's browser */ }
  }
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  evidence.browser = await browser.version();
});

after(async () => {
  await writeFile(join(artifacts, 'browser-observations.json'), JSON.stringify(evidence, null, 2) + '\n');
  await browser?.close();
  if (server) await new Promise(resolveClosed => server.close(resolveClosed));
  if (release) await rm(release, { recursive: true, force: true });
});

async function createContext(options = {}, { mockChat = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  const requests = [], external = [], errors = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin === origin) return route.continue();
    external.push({ url: request.url(), method: request.method(), referer: request.headers().referer || null, body: request.postData() });
    if (mockChat && request.url() === 'https://wa.me/74991306616') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local navigation observation</title><link rel="icon" href="data:,"><p>External network blocked by browser test.</p>' });
    }
    return route.abort();
  });
  return { context, requests, external, errors };
}

async function assertContact(page) {
  const text = await page.locator('#contact').innerText();
  assert.match(text, /Исполнитель\s+СтройИнжиниринг/);
  assert.match(text, /\+7 \(499\) 130-66-16/);
  assert.equal(await page.locator('#contact a[href="tel:+74991306616"]').count(), 1);
  assert.equal(await page.locator('#contact a[href="tel:+74991306616"]').isVisible(), true);
  assert.equal(await page.getByRole('link', { name: 'Открыть WhatsApp', exact: true }).isVisible(), true);
  const whatsapp = page.getByRole('link', { name: 'Открыть WhatsApp', exact: true });
  assert.equal(await whatsapp.getAttribute('href'), 'https://wa.me/74991306616');
  assert.equal(await whatsapp.getAttribute('target'), '_blank');
  assert.match(await whatsapp.getAttribute('rel'), /noopener/);
  assert.match(await whatsapp.getAttribute('rel'), /noreferrer/);
  assert.doesNotMatch(await page.locator('body').innerText(), /Telegram|\bMAX\b|Заявка отправлена|Сообщение отправлено/);
  assert.equal(await page.locator('a[href^="mailto:"], a[href*="t.me/"], input[type="email"], iframe, form').count(), 0);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow');
  return text;
}

async function assertWidth(page, width) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.equal(dimensions.viewport, width);
  assert.ok(dimensions.document <= width, `horizontal overflow at ${width}: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= width, `body overflow at ${width}: ${JSON.stringify(dimensions)}`);
  for (const selector of ['#draft', '#open-whatsapp', '#contact a[href^="tel:"]']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${selector} exceeds ${width}px`);
  }
  return dimensions;
}

test('контакты, privacy и макет доступны при JS/no-JS и 320–1440 px', async t => {
  for (const js of [true, false]) {
    for (const width of [320, 360, 768, 1024, 1440]) {
      const { context, external, errors } = await createContext({ javaScriptEnabled: js, viewport: { width, height: 1000 }, colorScheme: width === 320 || width === 1024 ? 'dark' : 'light' });
      try {
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: 'networkidle' });
        const contactText = await assertContact(page);
        const dimensions = await assertWidth(page, width);
        assert.equal(await page.locator('#calc').isVisible(), js);
        assert.equal(await page.getByRole('button', { name: 'Скопировать текст', exact: true }).isVisible(), js);
        assert.equal(await page.getByRole('button', { name: 'Скачать TXT', exact: true }).isVisible(), js);
        if (!js) {
          assert.match(contactText, /JavaScript отключён[\s\S]*скопируйте его вручную/);
          await page.getByLabel('Черновик заявки', { exact: true }).fill('Ручная запись без JavaScript — ёж 🏡');
          assert.equal(await page.getByLabel('Черновик заявки', { exact: true }).inputValue(), 'Ручная запись без JavaScript — ёж 🏡');
        } else if (width === 320) {
          await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
          assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('#menu-toggle').evaluate(element => document.activeElement === element), true);
        }
        if (width === 320 || width === 1440) {
          await page.locator('#contact').screenshot({ path: join(artifacts, `screenshots/contact-${width}-${js ? 'js' : 'nojs'}.png`) });
        }
        await page.goto(`${origin}/privacy.html`, { waitUntil: 'networkidle' });
        const privacyText = await page.locator('body').innerText();
        assert.match(privacyText, /SpaceWeb/);
        assert.match(privacyText, /реквизитами оператора будет опубликована после их подтверждения/);
        assert.match(privacyText, /Сроки хранения технических данных[\s\S]*отдельно не подтверждены/);
        assert.match(privacyText, /не подтверждает полное соответствие/);
        assert.doesNotMatch(privacyText, /Telegram|\bMAX\b|__cf_bm|Cloudflare|ChatGPT Sites/);
        assert.equal(await page.locator('a[href="tel:+74991306616"]').isVisible(), true);
        assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
        const privacyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(privacyWidth <= width, `privacy overflows ${width}px`);
        if (width === 320 && !js) await page.screenshot({ path: join(artifacts, 'screenshots/privacy-320-nojs.png'), fullPage: true });
        assert.deepEqual(external, [], 'page load must not contact external services');
        assert.deepEqual(errors, []);
        evidence.tests.push({ test: 'contact-matrix', js, width, dimensions, privacyWidth, contactText, privacyText, externalRequests: external.length, errors });
        t.diagnostic(`JS=${js}, width=${width}: телефон/WA видны; Telegram/MAX/email отсутствуют; document=${dimensions.document}; privacy=${privacyWidth}; внешних запросов 0.`);
      } finally { await context.close(); }
    }
  }
});

test('длинные заметки + состав → настоящий Clipboard/TXT → прямой чат без текста и отправки', async t => {
  const { context, requests, external, errors } = await createContext({ permissions: ['clipboard-read', 'clipboard-write'] }, { mockChat: true });
  try {
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle' });
    const draft = page.getByLabel('Черновик заявки', { exact: true });
    const notes = '  Мои заметки: сохранить яблоню; отступ 3 м. 🏡 ё & ? #\n\n' + Array.from({ length: 1200 }, (_, index) => `${index}: кирпич, вода и свет — заметка без персональных сведений.\n`).join('') + '  КОНЕЦ ЗАМЕТОК  \n';
    await draft.fill(notes);
    await page.getByRole('slider').focus();
    await page.keyboard.press('End');
    await page.locator('input[name="kit"][value="shell"]').check();
    await page.locator('input[name="wall"][value="ceramic"]').check();
    await page.locator('input[name="extras"][value="pond"]').check();
    await page.locator('input[name="extras"][value="engineering"]').check();
    await page.getByRole('link', { name: 'Добавить состав в черновик', exact: true }).click();
    const withProject = await draft.inputValue();
    assert.equal(withProject.slice(0, notes.length), notes, 'leading/trailing spaces, emoji and all notes must survive');
    assert.match(withProject.slice(notes.length), /Площадь дома: 400 м²/);
    assert.match(withProject.slice(notes.length), /Керамоблок 38/);
    assert.match(withProject.slice(notes.length), /Декоративный пруд/);
    assert.match(withProject.slice(notes.length), /Инженерия: ввод сетей и котельная/);
    await page.getByRole('link', { name: 'Добавить состав в черновик', exact: true }).click();
    assert.equal(await draft.inputValue(), withProject, 'repeated click must not duplicate the same composition');
    await page.locator('[data-topic="Озеленение и полив участка"]').click();
    const fullDraft = await draft.inputValue();
    assert.ok(fullDraft.startsWith(withProject));
    assert.match(fullDraft, /Идея: Озеленение и полив участка$/);
    await page.getByRole('button', { name: 'Скопировать текст', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Черновик скопирован.');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboard, fullDraft, 'browser clipboard must contain every character');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать TXT', exact: true }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), 'stroyengineering-project.txt');
    const bytes = await readFile(await download.path());
    assert.equal(bytes.toString('utf8').replace(/^\uFEFF/, ''), fullDraft, 'downloaded UTF-8 bytes must contain complete notes and project');
    const beforeChatStatus = await page.locator('#draft-status').innerText();
    const popupPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Открыть WhatsApp', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), 'https://wa.me/74991306616');
    assert.equal(await popup.evaluate(() => window.opener === null), true);
    assert.deepEqual(external, [{ url: 'https://wa.me/74991306616', method: 'GET', referer: null, body: null }]);
    await page.bringToFront();
    assert.equal(await page.locator('#draft-status').innerText(), beforeChatStatus);
    assert.equal(await draft.inputValue(), fullDraft);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fullDraft);
    const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: await indexedDB.databases(), workers: (await navigator.serviceWorker.getRegistrations()).length }));
    assert.deepEqual(storage, { local: 0, session: 0, cookies: '', databases: [], workers: 0 });
    assert.ok(requests.every(request => request.method === 'GET' && request.body === null));
    assert.ok(requests.every(request => !request.url.includes('КОНЕЦ') && !request.url.includes('text=')));
    assert.deepEqual(errors, []);
    await page.locator('#contact').screenshot({ path: join(artifacts, 'screenshots/copied-and-downloaded-1440.png') });
    evidence.tests.push({ test: 'complete-draft', notesLength: notes.length, draftLength: fullDraft.length, utf8Bytes: Buffer.byteLength(fullDraft), clipboardSha256: sha256(clipboard), draftSha256: sha256(fullDraft), downloadedSha256: sha256(bytes), txtMatchesDraftAfterOptionalBom: true, repeatCompositionUnchanged: true, popup: external, storage, statusBeforeChat: beforeChatStatus, statusAfterChat: await page.locator('#draft-status').innerText(), allRequests: requests.map(request => ({ ...request, url: request.url.replace(origin, 'LOCAL_ORIGIN') })), errors });
    t.diagnostic(`Наблюдаемое совпадение: ${fullDraft.length} UTF-16 единиц / ${Buffer.byteLength(fullDraft)} байт; Clipboard SHA-256=${sha256(clipboard)}; TXT полностью совпал; popup=${popup.url()}; storage пуст.`);
    // Reload is a real cross-document navigation: accepting the warning loses the
    // in-memory draft, which must not be restored from hidden persistent storage.
    let warning = null;
    page.once('dialog', async dialog => { warning = dialog.type(); await dialog.accept(); });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await draft.inputValue(), '');
    assert.equal(warning, 'beforeunload');
    evidence.tests.push({ test: 'reload', warning, draftAfterReload: await draft.inputValue() });
  } finally { await context.close(); }
});

test('пустой ввод, отказ Clipboard и недоступный TXT сохраняют ручной запасной путь', async t => {
  const { context, external, errors } = await createContext({ viewport: { width: 320, height: 1000 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Test permission denial', 'NotAllowedError'); } } });
  });
  try {
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle' });
    const draft = page.getByLabel('Черновик заявки', { exact: true });
    const copy = page.getByRole('button', { name: 'Скопировать текст', exact: true });
    const txt = page.getByRole('button', { name: 'Скачать TXT', exact: true });
    for (const empty of ['', ' \n\t ']) {
      await draft.fill(empty);
      assert.equal(await copy.isDisabled(), true);
      assert.equal(await txt.isDisabled(), true);
    }
    const value = '  Ручное копирование: ё, 🏡, & ? #\n\n' + 'Все заметки должны остаться.\n'.repeat(500) + '  КОНЕЦ  \n';
    await draft.fill(value);
    await copy.click();
    await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('Текст выделен'));
    const selection = await draft.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd, length: element.value.length, active: document.activeElement === element }));
    assert.deepEqual(selection, { start: 0, end: value.length, length: value.length, active: true });
    const fallbackStatus = await page.locator('#draft-status').innerText();
    assert.match(fallbackStatus, /скопируйте его вручную или скачайте TXT/);
    assert.equal(await draft.inputValue(), value);
    assert.equal(await page.getByRole('link', { name: 'Открыть WhatsApp', exact: true }).getAttribute('href'), 'https://wa.me/74991306616');
    await page.locator('#contact').screenshot({ path: join(artifacts, 'screenshots/clipboard-denied-320.png') });
    const downloadPromise = page.waitForEvent('download');
    await txt.click();
    const download = await downloadPromise;
    assert.equal((await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, ''), value);
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Simulated unavailable download API'); }; });
    await txt.click();
    assert.match(await page.locator('#draft-status').innerText(), /Не удалось подготовить файл/);
    assert.equal(await draft.inputValue(), value);
    await assertContact(page);
    await assertWidth(page, 320);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    evidence.tests.push({ test: 'api-failures', emptyActionsDisabled: true, selection, fallbackStatus, downloadAfterClipboardFailureMatches: true, statusAfterTxtFailure: await page.locator('#draft-status').innerText(), draftUnchangedAfterBothFailures: true, externalRequests: external.length, errors });
    t.diagnostic(`Отказ Clipboard: выделено [0,${selection.end}], фокус в поле; TXT после отказа совпал; ошибка подготовки TXT не изменила текст; телефон и WhatsApp доступны.`);
  } finally { await context.close(); }
});
