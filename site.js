import { appendDraft, copyDraft, createProject, createTextExport, describeProject } from './project.js';

const config = document.querySelector('#calc');
const area = document.querySelector('#area');
const areaOutput = document.querySelector('#areaOut');
const engineering = document.querySelector('#net');
const engineeringHint = document.querySelector('#engineering-hint');
const summary = document.querySelector('#project-summary');
const draft = document.querySelector('#draft');
const status = document.querySelector('#draft-status');
const copyButton = document.querySelector('#copy-draft');
const downloadButton = document.querySelector('#download-draft');
let separateEngineering = false;

function updateProject() {
  const kit = config.querySelector('[name="kit"]:checked').value;
  const included = kit !== 'shell';
  engineering.disabled = included;
  engineering.checked = included || separateEngineering;
  engineeringHint.textContent = included ? 'Входит в комплектацию' : 'Отдельная опция';
  const project = createProject({
    area: area.value,
    kit,
    wall: config.querySelector('[name="wall"]:checked').value,
    extras: Array.from(config.querySelectorAll('[name="extras"]:checked'), input => input.value),
  });
  areaOutput.value = `${project.area} м²`;
  area.setAttribute('aria-valuetext', `${project.area} квадратных метров`);
  summary.textContent = describeProject(project);
}

config.addEventListener('input', event => {
  if (event.target === engineering) separateEngineering = engineering.checked;
  try { updateProject(); } catch { summary.textContent = 'Не удалось обновить состав. Проверьте выбранные параметры.'; }
});

function updateDraftActions() {
  const empty = !draft.value.trim();
  copyButton.disabled = empty;
  downloadButton.disabled = empty;
}

// После восстановления страницы доступность копирования зависит от черновика.
window.addEventListener('pageshow', () => { updateDraftActions(); updateProject(); });

function addToDraft(text) {
  const result = appendDraft(draft.value, text);
  draft.value = result.text;
  status.textContent = result.added
    ? 'Добавлено в конец черновика. Ваш текст сохранён.'
    : 'Этот состав или идея уже есть в черновике.';
  updateDraftActions();
}

document.querySelector('#calcCta').addEventListener('click', () => addToDraft(summary.textContent));
document.querySelectorAll('[data-topic]').forEach(link => {
  link.addEventListener('click', () => addToDraft(`Идея: ${link.dataset.topic}`));
});
draft.addEventListener('input', () => {
  status.textContent = '';
  updateDraftActions();
});

copyButton.addEventListener('click', async () => {
  try {
    await copyDraft(draft.value, navigator.clipboard);
    status.textContent = 'Черновик скопирован.';
  } catch {
    draft.focus();
    draft.select();
    status.textContent = 'Не удалось скопировать автоматически. Текст выделен: скопируйте его вручную или скачайте TXT.';
  }
});

downloadButton.addEventListener('click', () => {
  let url;
  try {
    const file = createTextExport(draft.value);
    url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.append(link);
    link.click();
    link.remove();
    status.textContent = 'TXT-файл подготовлен к скачиванию.';
  } catch {
    status.textContent = 'Не удалось подготовить файл. Скопируйте текст черновика.';
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

window.addEventListener('beforeunload', event => {
  if (draft.value.trim()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

updateProject();
updateDraftActions();
document.querySelectorAll('[data-js-label]').forEach(element => {
  element.textContent = element.dataset.jsLabel;
});
document.querySelectorAll('[data-js-only]').forEach(element => { element.hidden = false; });


const reset = document.querySelector('#reset-project');
reset.addEventListener('click', () => {
  area.value = '160';
  config.querySelectorAll('[name="kit"]').forEach(input => { input.checked = input.value === 'turnkey'; });
  config.querySelectorAll('[name="wall"]').forEach(input => { input.checked = input.value === 'aerated'; });
  config.querySelectorAll('[name="extras"]').forEach(input => { input.checked = false; });
  separateEngineering = false;
  updateProject();
  status.textContent = 'Выбор сброшен. Ваш черновик сохранён.';
});
