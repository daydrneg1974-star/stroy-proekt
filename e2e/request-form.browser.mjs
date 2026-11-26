import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Explicit opt-in: npm run e2e:php. The published handler stays disabled.
// Each enabled case lives outside the release and never loads SMTP code.
const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = resolve(process.env.STROY_PHP_E2E_ARTIFACTS || join(root, 'docs/tasks/artifacts/T07/php-browser'));
const php = process.env.PHP_BIN || 'php';
const evidence = { localOnly: true, realSmtpCalls: 0, cases: [] };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const phpQuote = value => "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
let directory, release, origin, browser, server, serverExit, phpLog = '';

before(async () => {
  await mkdir(join(artifacts, 'screenshots'), { recursive: true });
  directory = await mkdtemp(join(tmpdir(), 'stroy-php-browser-'));
  release = join(directory, 'release');
  execFileSync(process.execPath, ['scripts/build.mjs', release], { cwd: root });
  evidence.manifestSha256 = sha256(await readFile(join(release, 'release-manifest.json')));
  evidence.php = execFileSync(php, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
  const socket = createServer();
  await new Promise(resolveListening => socket.listen(0, '127.0.0.1', resolveListening));
  const port = socket.address().port;
  await new Promise(resolveClosed => socket.close(resolveClosed));
  origin = `http://127.0.0.1:${port}`;
  await writeFile(join(directory, 'router.php'), `<?php
if (PHP_SAPI !== 'cli-server') {http_response_code(404);exit;}
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if (!str_starts_with($path,'/__qa/')) return false;
if (preg_match('#^/__qa/([a-z-]+)/request.php$#D',$path,$match)) {
  $file=__DIR__.'/cases/'.$match[1].'/bootstrap.php';
  if (is_file($file)) {require $file;exit;}
}
http_response_code(404);exit;
`);
  const env = { ...process.env };
  delete env.STROY_FORM_CONFIG;
  server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', join(release, 'public_html'), join(directory, 'router.php')], { env });
  serverExit = once(server, 'exit');
  server.stdout.on('data', data => { phpLog += data; });
  server.stderr.on('data', data => { phpLog += data; });
  await Promise.race([
    (async () => {
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(`${origin}/request.php`)).status === 503) return; } catch { /* wait for local PHP */ }
        await new Promise(resolveWait => setTimeout(resolveWait, 50));
      }
      throw Error(`PHP startup failed: ${phpLog}`);
    })(),
    serverExit.then(() => { throw Error(`PHP exited: ${phpLog}`); }),
  ]);
  const modulePath = process.env.STROY_PLAYWRIGHT_MODULE || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES && join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.js'));
  const imported = await import(modulePath ? pathToFileURL(modulePath) : 'playwright');
  const { chromium } = imported.default || imported;
  browser = await chromium.launch({ headless: true, executablePath: process.env.STROY_CHROMIUM_PATH, args: ['--no-sandbox'] });
  evidence.browser = browser.version();
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await serverExit; }
  await writeFile(join(artifacts, 'observations.json'), JSON.stringify(evidence, null, 2) + '\n');
  await writeFile(join(artifacts, 'php.log'), phpLog);
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture(name, mode = 'accepted') {
  const privateRoot = join(directory, 'cases', name);
  await mkdir(privateRoot, { recursive: true });
  await copyFile(join(release, 'private/app.php'), join(privateRoot, 'app.php'));
  let bootstrap = await readFile(join(release, 'private/bootstrap.php'), 'utf8');
  const importSeam = "require_once __DIR__.'/transport.php';";
  const callSeam = 'fn($body)=>makeMailer($config,$body)->send()';
  assert.equal(bootstrap.split(importSeam).length, 2, 'review changed transport import');
  assert.equal(bootstrap.split(callSeam).length, 2, 'review changed transport call');
  bootstrap = bootstrap.replace(importSeam, '// Test fixture: no mail transport is present.').replace(callSeam, `function($body) {
    $mode=trim(file_get_contents(__DIR__.'/mode.txt'));
    file_put_contents(__DIR__.'/calls.jsonl',json_encode(['mode'=>$mode,'bytes'=>strlen($body),'sha256'=>hash('sha256',$body)])."\\n",FILE_APPEND|LOCK_EX);
    return $mode==='accepted';
  }`);
  assert.doesNotMatch(bootstrap, /makeMailer|transport\.php/);
  await writeFile(join(privateRoot, 'bootstrap.php'), bootstrap);
  let form = await readFile(join(release, 'private/form.php'), 'utf8');
  form = form.replace(/(href|src)="(styles\.css|request\.css|request\.js|assets\/|index\.html|privacy\.html)/g, '$1="/$2')
    .replace('<main id="request-main"', '<p>ЛОКАЛЬНЫЙ ТЕСТ: подставной транспорт, писем нет.</p><main id="request-main"');
  await writeFile(join(privateRoot, 'form.php'), form);
  await writeFile(join(privateRoot, 'mode.txt'), mode);
  await writeFile(join(privateRoot, 'config.php'), `<?php return [
    'enabled'=>true,'privacy_ready'=>true,'smtp_port'=>465,
    'recipient'=>'recipient@example.invalid','from'=>'sender@example.invalid',
    'smtp_host'=>'smtp.example.invalid','smtp_user'=>'test','smtp_password'=>'test-only',
    'secret'=>str_repeat('t',64),'storage'=>${phpQuote(join(privateRoot, 'runtime'))},
    'consent_text'=>'Тестовое согласие с синтетическими данными','origin'=>${phpQuote(origin)}
  ];`);
  return {
    url: `${origin}/__qa/${name}/request.php`,
    calls: async () => (await readFile(join(privateRoot, 'calls.jsonl'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return ''; throw error;
    })).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
  };
}

async function contextFor(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ...options });
  const posts = [], errors = [], external = [];
  context.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(external, [], 'no external requests');
    assert.deepEqual(errors, [], 'no JS exceptions');
  });
  return { context, page: await context.newPage(), posts };
}

const message = 'СИНТЕТИЧЕСКАЯ ПРОВЕРКА — дом 160 м².\nЁлка, кавычки «тест», & < >, строка 🏠.\nЛичных данных нет.';
async function toggle(page, locator, keyboard = false) {
  if (keyboard) { await locator.focus(); await page.keyboard.press('Space'); }
  else await locator.click();
}
async function fill(page, { phone = '+7 (000) 000-00-00', text = message, options = false, keyboard = false } = {}) {
  await page.locator('#request-name').fill('Тест формы');
  await page.locator('#request-phone').fill(phone);
  await page.locator('#request-message').fill(text);
  if (options) {
    await toggle(page, page.locator('.request-options summary'), keyboard);
    await page.locator('#request-area').fill('160');
    await page.locator('#request-kit').selectOption('turnkey');
    await page.locator('#request-wall').selectOption('aerated');
    await toggle(page, page.locator('[name="extras[]"][value="pond"]'), keyboard);
  }
  await toggle(page, page.locator('[name="consent"]'), keyboard);
}

async function send(page, keyboard = false) {
  const response = page.waitForResponse(response => response.request().method() === 'POST');
  await toggle(page, page.locator('#send-request'), keyboard);
  return response;
}
async function statusIncludes(page, pattern) {
  await page.waitForFunction(source => new RegExp(source).test(document.querySelector('#request-status').textContent), pattern.source);
}
async function snapshot(page, name) {
  // A full-page capture from a scrolled viewport can include fixed elements
  // that are actually above the visible area. Capture from the document top.
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: join(artifacts, 'screenshots', `${name}.png`), fullPage: true, animations: 'disabled' });
}

test('публичная форма остаётся выключенной с JS и без JS', async t => {
  for (const javaScriptEnabled of [true, false]) {
    const { page, context } = await contextFor(t, { javaScriptEnabled, viewport: { width: 320, height: 800 } });
    const response = await page.goto(`${origin}/request.php`);
    assert.equal(response.status(), 503);
    assert.match(response.headers()['cache-control'], /no-store/);
    assert.equal(await page.locator('#request-form').getAttribute('data-enabled'), 'false');
    assert.equal(await page.locator('#send-request').isDisabled(), true);
    assert.equal(await page.locator('#request-message').isDisabled(), true);
    assert.deepEqual(await context.cookies(), []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (javaScriptEnabled) {
      const result = await page.evaluate(async () => {
        const response = await fetch('request.php', { method: 'POST', headers: { Accept: 'application/json' }, body: 'message=test' });
        return { status: response.status, json: await response.json() };
      });
      assert.equal(result.status, 503); assert.equal(result.json.code, 'disabled');
      assert.deepEqual(await context.cookies(), []);
    }
    evidence.cases.push({ name: 'disabled', javaScriptEnabled, status: 503, cookies: 0 });
  }
});

test('JS: ошибки сервера сохраняют текст и переводят фокус к полю', async t => {
  const qa = await fixture('validation');
  const { page } = await contextFor(t);
  await page.goto(qa.url);
  await fill(page, { phone: '123', options: true });
  const response = await send(page);
  assert.equal(response.status(), 422);
  await statusIncludes(page, /Проверьте отмеченные поля/);
  assert.equal(await page.locator('#request-phone').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#request-phone').evaluate(field => field === document.activeElement), true);
  assert.equal(await page.locator('#request-message').inputValue(), message);
  assert.equal(await page.locator('#request-area').inputValue(), '160');
  assert.equal(await page.locator('[value="pond"]').isChecked(), true);
  assert.equal(await page.locator('[name="consent"]').isChecked(), true);
  assert.equal(await page.locator('#send-request').isEnabled(), true);
  assert.equal((await qa.calls()).length, 0);
  await snapshot(page, 'validation');
  evidence.cases.push({ name: 'js-validation', status: 422, exactText: true, fakeCalls: 0, focus: 'request-phone' });
});

test('JS: ошибка в закрытом составе видна и получает фокус', async t => {
  const qa = await fixture('collapsed-options');
  const { page } = await contextFor(t);
  await page.goto(qa.url); await fill(page, { options: true });
  await page.locator('#request-area').fill('');
  await page.locator('.request-options summary').click();
  assert.equal((await send(page)).status(), 422);
  await statusIncludes(page, /Проверьте отмеченные поля/);
  assert.equal(await page.locator('#error-area').isVisible(), true, 'optional field error must be visible');
  assert.equal(await page.locator('#request-area').evaluate(field => field === document.activeElement), true);
  assert.equal(await page.locator('#request-message').inputValue(), message);
  assert.equal((await qa.calls()).length, 0);
  await snapshot(page, 'collapsed-options');
  evidence.cases.push({ name: 'collapsed-options', status: 422, errorVisible: true, focus: 'request-area', fakeCalls: 0 });
});

test('JS: повтор submit во время ожидания вызывает подставной транспорт один раз', async t => {
  const qa = await fixture('pending');
  const { page, context, posts } = await contextFor(t);
  await page.goto(qa.url); await fill(page);
  let releaseRequest;
  const gate = new Promise(resolveGate => { releaseRequest = resolveGate; });
  await context.route(qa.url, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await gate; await route.continue();
  });
  try {
    await page.locator('#send-request').click();
    await statusIncludes(page, /Отправляем обращение/);
    assert.equal(await page.locator('#send-request').isDisabled(), true);
    await page.locator('#request-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    const response = page.waitForResponse(response => response.request().method() === 'POST');
    releaseRequest();
    assert.equal((await response).status(), 200);
    await statusIncludes(page, /Получение адресатом пока не подтверждено/);
    assert.equal(posts.length, 1); assert.equal((await qa.calls()).length, 1);
    assert.equal(await page.locator('#request-message').inputValue(), '');
    assert.equal(await page.locator('#send-request').isDisabled(), true);
    await snapshot(page, 'accepted');
    evidence.cases.push({ name: 'pending-and-accepted', posts: posts.length, fakeCalls: 1, reset: true, receiptNotClaimed: true });
  } finally { releaseRequest(); }
});

test('без JS: POST → 303 → GET, исправление и reload без повторной отправки', async t => {
  const qa = await fixture('native');
  const { page, posts } = await contextFor(t, { javaScriptEnabled: false });
  // Use native keyboard activation. No force-click or programmatic form.submit().
  await page.goto(qa.url); await fill(page, { phone: '123', options: true, keyboard: true });
  await page.locator('#request-area').fill('');
  assert.equal((await send(page, true)).status(), 303);
  await page.waitForLoadState();
  await statusIncludes(page, /Проверьте отмеченные поля/);
  assert.equal(await page.locator('#request-message').inputValue(), message);
  assert.equal(await page.locator('#request-area').inputValue(), '');
  assert.equal(await page.locator('[value="pond"]').isChecked(), true);
  assert.equal(await page.locator('[name="consent"]').isChecked(), true);
  assert.equal(await page.locator('#error-area').isVisible(), true, 'native POST must reveal invalid optional fields');
  await snapshot(page, 'native-validation');
  assert.equal((await qa.calls()).length, 0);
  assert.equal((await page.reload()).status(), 422);
  assert.equal(posts.length, 1);
  await page.locator('#request-phone').fill('+7 (000) 000-00-00');
  await page.locator('#request-area').fill('160');
  assert.equal((await send(page, true)).status(), 303);
  await page.waitForLoadState();
  await statusIncludes(page, /Получение адресатом пока не подтверждено/);
  assert.equal((await qa.calls()).length, 1);
  assert.equal(await page.locator('#request-message').inputValue(), '');
  assert.equal((await page.reload()).status(), 200);
  assert.equal(posts.length, 2); assert.equal((await qa.calls()).length, 1);
  evidence.cases.push({ name: 'native-prg', postStatuses: [303, 303], reloadStatuses: [422, 200], posts: 2, fakeCalls: 1, exactTextAfterError: true });
});

test('ошибка транспорта и ручной повтор сохраняют текст без повторного вызова', async t => {
  const qa = await fixture('transport-error', 'uncertain');
  const { page, posts } = await contextFor(t);
  await page.goto(qa.url); await fill(page);
  assert.equal((await send(page)).status(), 503);
  await statusIncludes(page, /Отправка не подтверждена/);
  assert.equal(await page.locator('#request-message').inputValue(), message);
  assert.equal((await qa.calls()).length, 1);
  assert.equal((await send(page)).status(), 409);
  await statusIncludes(page, /Предыдущая попытка уже выполнялась/);
  assert.equal(await page.locator('#request-message').inputValue(), message);
  assert.equal((await qa.calls()).length, 1);
  await snapshot(page, 'transport-uncertain');
  evidence.cases.push({ name: 'transport-uncertain', statuses: [503, 409], posts: posts.length, fakeCalls: 1, exactText: true });
});

test('потеря ответа после приёма: таймаут 15 секунд сохраняет текст без автоматического повтора', async t => {
  const qa = await fixture('lost-response');
  const { page, context, posts } = await contextFor(t);
  await page.goto(qa.url); await fill(page);
  let releaseResponse;
  const gate = new Promise(resolveGate => { releaseResponse = resolveGate; });
  let serverStatus;
  await context.route(qa.url, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    serverStatus = response.status();
    await gate; await route.abort().catch(() => {});
  });
  try {
    const started = Date.now();
    await page.locator('#send-request').click();
    await statusIncludes(page, /Отправка могла состояться/);
    const elapsedMs = Date.now() - started;
    assert.ok(elapsedMs >= 14000 && elapsedMs < 25000, `timeout ${elapsedMs}ms`);
    assert.equal(serverStatus, 200);
    assert.equal(await page.locator('#request-message').inputValue(), message);
    assert.equal(await page.locator('#send-request').isEnabled(), true);
    assert.equal(posts.length, 1); assert.equal((await qa.calls()).length, 1);
    await snapshot(page, 'lost-response');
    evidence.cases.push({ name: 'lost-response', serverStatus, elapsedMs, posts: 1, fakeCalls: 1, exactText: true, noAutomaticRetry: true });
  } finally { releaseResponse(); }
});

test('шестая попытка за час: настоящий PHP 429 сохраняет текст', async t => {
  const qa = await fixture('rate-limit');
  const { page, posts } = await contextFor(t);
  for (let i = 1; i <= 6; i++) {
    await page.goto(qa.url); await fill(page, { text: `${message}\nВариант ${i}` });
    const response = await send(page);
    assert.equal(response.status(), i === 6 ? 429 : 200);
    if (i < 6) await statusIncludes(page, /Для нового обращения/);
    else {
      await statusIncludes(page, /Слишком много попыток/);
      assert.equal(response.headers()['retry-after'], '3600');
      assert.equal(await page.locator('#request-message').inputValue(), `${message}\nВариант 6`);
      assert.equal(await page.locator('#send-request').isEnabled(), true);
    }
  }
  assert.equal((await qa.calls()).length, 5);
  evidence.cases.push({ name: 'rate-limit', statuses: [200, 200, 200, 200, 200, 429], posts: posts.length, fakeCalls: 5, exactTextOnLimit: true });
});
