import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validateBuildDestination } from './build.mjs';
import { PUBLIC_FILES } from './public-files.mjs';

const SITE_ORIGIN = 'https://stroyinzh-dom.ru';
const PREVIOUS_ORIGIN = 'https://stroyengineering-demo-rifkat.daydrneg1974.chatgpt.site';

function replaceOnce(html, before, after) {
  if (html.split(before).length !== 2) throw new Error('Исходный текст изменился; проверьте адаптацию для SpaceWeb.');
  return html.replace(before, after);
}

export const apacheConfig = `Options -Indexes
DirectoryIndex index.html
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set X-Robots-Tag "noindex, nofollow, noarchive"
</IfModule>
<FilesMatch "(?i)(^\\.|\\.(zip|tar|gz|log|bak|sql)$)">
  Require all denied
</FilesMatch>
<IfModule mod_rewrite.c>
  RewriteEngine On
  SetEnvIf X-Forwarded-Proto https SERVER_PORT=443
  SetEnvIf X-Forwarded-Proto https HTTPS=on
  RewriteCond %{HTTP:HTTPS} !=on [NC]
  RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/
  RewriteRule ^ https://stroyinzh-dom.ru%{REQUEST_URI} [R=302,L,NE]
  RewriteRule ^privacy/?$ https://stroyinzh-dom.ru/privacy.html [R=302,L]
</IfModule>
`;

const holdingPage = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>СтройИнжиниринг — сайт готовится к запуску</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>html{color-scheme:dark}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#141416;color:#f4f4f1;font:18px/1.6 system-ui,sans-serif}main{max-width:720px;padding:32px}p{color:#c4c4bd}h1{font-size:clamp(30px,6vw,56px);line-height:1.15;letter-spacing:-.025em}.brand{font-weight:700;color:#f5a31a;letter-spacing:.06em}</style>
</head><body><main><p class="brand">СТРОЙИНЖИНИРИНГ</p><h1>Сайт готовится к запуску</h1><p>Мы проверяем страницы и готовим информацию об услугах.</p></main></body></html>
`;

export async function buildSpaceWeb(destination, previewName = `review-${randomBytes(18).toString('hex')}`) {
  if (!destination) throw new Error('Укажите новый пустой каталог сборки.');
  if (!/^review-[a-f0-9]{36}$/.test(previewName)) throw new Error('Недопустимый путь проверочной версии.');
  const output = await validateBuildDestination(destination);
  const publicRoot = resolve(output, 'public_html');
  const previewRoot = resolve(publicRoot, previewName);
  await build(previewRoot);

  const indexPath = resolve(previewRoot, 'index.html');
  let index = (await readFile(indexPath, 'utf8')).replaceAll(PREVIOUS_ORIGIN, SITE_ORIGIN);
  index = replaceOnce(index,
    '<p>При загрузке сайта инфраструктура получает IP-адрес и технические параметры запроса и может вести журналы. При проверке 22 ноября 2026 года наблюдался защитный cookie <code>__cf_bm</code>. Сроки хранения технических данных и настройки инфраструктуры отдельно не подтверждены.</p>',
    '<p>Проверочная копия размещена на SpaceWeb. При загрузке страниц и файлов хостинг получает IP-адрес и технические параметры HTTP-запросов и может вести журналы. Фактические настройки журналов и сроки хранения данных для этой копии требуют отдельного подтверждения.</p>');
  await writeFile(indexPath, index);

  const privacyPath = resolve(previewRoot, 'privacy.html');
  let privacy = (await readFile(privacyPath, 'utf8')).replaceAll(PREVIOUS_ORIGIN, SITE_ORIGIN);
  privacy = replaceOnce(privacy,
    '<p>При проверке публичного сайта 22 ноября 2026 года в ответе наблюдался cookie <code>__cf_bm</code>. Cloudflare использует его для защиты от автоматизированного трафика. По <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noopener noreferrer">официальному описанию cookies Cloudflare</a> этот cookie истекает после 30 минут непрерывного бездействия. Это не устанавливает срок хранения журналов инфраструктуры.</p>',
    '<p>Эта проверочная копия размещена на виртуальном хостинге SpaceWeb. В <a href="https://help.sweb.ru/kak-posmotret6-logi_42.html" target="_blank" rel="noopener noreferrer">документации хостера</a> указан общий срок хранения журналов 30 дней. Фактические настройки и сроки хранения для этой копии отдельно проверяются.</p>');
  await writeFile(privacyPath, privacy);

  await mkdir(publicRoot, { recursive: true });
  await writeFile(resolve(publicRoot, 'index.html'), holdingPage);
  await writeFile(resolve(publicRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await copyFile(resolve(previewRoot, 'assets/favicon.svg'), resolve(publicRoot, 'favicon.svg'));
  await writeFile(resolve(publicRoot, '.htaccess'), apacheConfig);
  await writeFile(resolve(previewRoot, '.htaccess'), apacheConfig);

  const files = ['index.html', 'robots.txt', 'favicon.svg', '.htaccess', `${previewName}/.htaccess`,
    ...PUBLIC_FILES.map(name => `${previewName}/${name}`)];
  const manifest = [];
  for (const name of files) {
    const bytes = await readFile(resolve(publicRoot, name));
    manifest.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const result = { origin: SITE_ORIGIN, previewPath: previewName, previewUrl: `${SITE_ORIGIN}/${previewName}/`,
    output, publicRoot, applicationFiles: PUBLIC_FILES.length, files: manifest };
  // Манифест находится вне public_html и не предназначен для публикации.
  await writeFile(resolve(output, 'release-manifest.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildSpaceWeb(process.argv[2]);
  console.log(JSON.stringify({ output: result.output, previewUrl: result.previewUrl,
    applicationFiles: result.applicationFiles, publicFiles: result.files.length }, null, 2));
}
