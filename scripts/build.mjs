import { copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from './public-files.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'dist');

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
  if (output !== DEFAULT_OUTPUT && existing && (await readdir(output)).length) {
    throw new Error('Для сборки вне dist нужен пустой или новый каталог.');
  }
  return output;
}

export async function build(destination = DEFAULT_OUTPUT) {
  const output = await validateBuildDestination(destination);
  for (const name of PUBLIC_FILES) {
    if (!/^(?:assets\/)?[a-z0-9.-]+$/.test(name) || !(await lstat(resolve(ROOT, name))).isFile()) {
      throw new Error(`Недопустимый публичный файл: ${name}`);
    }
  }
  if (output === DEFAULT_OUTPUT) await rm(output, { recursive: true, force: true });
  for (const name of PUBLIC_FILES) {
    const target = resolve(output, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(ROOT, name), target);
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await build();
  console.log(`Сборка готова: ${PUBLIC_FILES.length} публичных файлов в ${output}`);
}
