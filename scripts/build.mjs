import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from './public-files.mjs';
import { renderContacts, validateContacts } from './contacts.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'dist');
export const SITE_ORIGIN = 'https://stroyinzh-dom.ru';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Редактор SpaceWeb убирает завершающие переводы строк. Нормализация
// выполняется до версий модулей и манифеста, медиа остаются побайтно прежними.
export function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').trimEnd();
}

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) {
    throw new Error(`В исходниках должна быть одна ссылка ${before}`);
  }
  return text.replace(before, after);
}

export async function validateBuildDestination(destination = DEFAULT_OUTPUT) {
  const output = resolve(destination);
  const pathToRoot = relative(output, ROOT);
  if (pathToRoot === '' || (pathToRoot !== '..' && !pathToRoot.startsWith(`..${sep}`) && !isAbsolute(pathToRoot))) {
    throw new Error('Сборка не может перезаписать исходники или их родительский каталог.');
  }
  let existing;
  try {
    existing = await lstat(output);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing && !existing.isDirectory()) {
    throw new Error('Каталог сборки не может быть файлом или символической ссылкой.');
  }
  for (let parent = dirname(output); parent !== dirname(parent); parent = dirname(parent)) {
    const entry = await lstat(parent).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (entry?.isSymbolicLink()) throw new Error('Путь сборки не может проходить через символическую ссылку.');
  }
  if (output !== DEFAULT_OUTPUT && existing && (await readdir(output)).length) {
    throw new Error('Для сборки вне dist нужен пустой или новый каталог.');
  }
  return output;
}

export async function build(destination = DEFAULT_OUTPUT) {
  const output = await validateBuildDestination(destination);
  const contacts = validateContacts(JSON.parse(await readFile(resolve(ROOT, 'contacts.json'), 'utf8')));
  const contents = new Map();
  for (const name of PUBLIC_FILES) {
    if (!/^(?:assets\/)?[a-z0-9.-]+$/.test(name) || !(await lstat(resolve(ROOT, name))).isFile()) {
      throw new Error(`Недопустимый публичный файл: ${name}`);
    }
    const bytes = await readFile(resolve(ROOT, name));
    contents.set(name, /\.(?:html|js|txt)$/.test(name) || name === '.htaccess'
      ? Buffer.from(normalizeText(bytes.toString('utf8'))) : bytes);
    if (name.endsWith('.html')) contents.set(name, Buffer.from(renderContacts(contents.get(name).toString('utf8'), contacts)));
  }
  const site = replaceOnce(contents.get('site.js').toString('utf8'), "from './project.js'",
    `from './project.js?v=${sha256(contents.get('project.js'))}'`);
  contents.set('site.js', Buffer.from(site));
  const index = replaceOnce(contents.get('index.html').toString('utf8'), 'src="site.js"',
    `src="site.js?v=${sha256(contents.get('site.js'))}"`);
  contents.set('index.html', Buffer.from(index));

  // Все исходники прочитаны и проверены до очистки предыдущего dist.
  if (output === DEFAULT_OUTPUT) await rm(output, { recursive: true, force: true });
  const publicRoot = resolve(output, 'public_html');
  const files = [];
  for (const name of PUBLIC_FILES) {
    const target = resolve(publicRoot, name);
    await mkdir(dirname(target), { recursive: true });
    const bytes = contents.get(name);
    await writeFile(target, bytes);
    files.push({ name, size: bytes.length, sha256: sha256(bytes) });
  }
  // Без времени и абсолютных путей: одинаковые исходники дают одинаковый релиз.
  const manifest = { version: 1, origin: SITE_ORIGIN, publicDirectory: 'public_html', files };
  await writeFile(resolve(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await build(process.argv[2]);
  console.log(`Сборка SpaceWeb готова: ${PUBLIC_FILES.length} файлов в ${resolve(output, 'public_html')}; манифест — ${resolve(output, 'release-manifest.json')}`);
}
