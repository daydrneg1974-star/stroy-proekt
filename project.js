export const KITS = Object.freeze({
  shell: 'Коробка: фундамент, стены, кровля',
  prepared: 'Под чистовую: коробка, инженерия и сети',
  turnkey: 'Под ключ: коробка, инженерия, сети и отделка',
});

export const WALLS = Object.freeze({
  aerated: 'Газобетон D400',
  ceramic: 'Керамоблок 38',
});

export const EXTRAS = Object.freeze({
  bath: 'Банный комплекс',
  pool: 'Бетонный бассейн',
  engineering: 'Инженерия: ввод сетей и котельная',
  gas: 'Газификация',
  epdm: 'EPDM-покрытие',
  landscape: 'Ландшафтный дизайн и благоустройство',
  pond: 'Декоративный пруд',
});

export function createProject({ area, kit, wall, extras = [] }) {
  const numericArea = Number(area);
  if (!Number.isFinite(numericArea) || numericArea < 60 || numericArea > 400 || numericArea % 5 !== 0) {
    throw new RangeError('Площадь должна быть от 60 до 400 м² с шагом 5 м².');
  }
  if (!Object.hasOwn(KITS, kit) || !Object.hasOwn(WALLS, wall)) {
    throw new RangeError('Неизвестная комплектация или материал.');
  }
  const selectedExtras = new Set(extras);
  const includedEngineering = kit !== 'shell';
  return {
    area: numericArea,
    kit,
    wall,
    includedEngineering,
    extras: Object.keys(EXTRAS).filter(key => selectedExtras.has(key)
      && !(includedEngineering && key === 'engineering')),
  };
}

export function describeProject(project) {
  return [
    'Состав проекта',
    `Площадь дома: ${project.area} м²`,
    `Комплектация: ${KITS[project.kit]}`,
    `Материал стен: ${WALLS[project.wall]}`,
    `Дополнительно: ${project.extras.length ? project.extras.map(key => EXTRAS[key]).join('; ') : 'не выбрано'}`,
    'Стоимость и сроки не рассчитаны.',
    'Предварительный список пожеланий, не смета и не договор.',
  ].join('\n');
}

// Добавление сохраняет пользовательский текст побайтно, включая пробелы и переносы.
export function appendDraft(draft, addition) {
  const current = String(draft);
  const block = String(addition);
  if (!block.trim() || current.split(/\n{2,}/).includes(block)) {
    return { text: current, added: false };
  }
  const separator = !current || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  return { text: current + separator + block, added: true };
}

export function createTextExport(draft) {
  const content = String(draft);
  if (!content.trim()) throw new RangeError('Черновик пуст.');
  return {
    filename: 'stroyengineering-project.txt',
    type: 'text/plain;charset=utf-8',
    content: '\uFEFF' + content,
  };
}

export async function copyDraft(draft, clipboard) {
  if (!String(draft).trim()) throw new RangeError('Черновик пуст.');
  if (!clipboard?.writeText) throw new Error('Копирование недоступно.');
  await clipboard.writeText(String(draft));
}
