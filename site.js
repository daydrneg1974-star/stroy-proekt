import { appendDraft, copyDraft, createMessengerLinks, createProject, createTextExport, describeProject } from './project.js?v=27b9f367a757b8dee19a38aadf083b79fe17ef4d66ccebeb37dc07dfdf296bce';

const root = document.documentElement;
const header = document.querySelector('header');
const menu = document.querySelector('#menu-toggle');
const navigation = document.querySelector('#navigation');
const narrowScreen = window.matchMedia('(max-width: 1100px)');

function measureHeader() {
  root.style.setProperty('--header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
}

function setMenu(open, returnFocus = false) {
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menu.textContent = open ? 'Закрыть' : 'Меню';
  navigation.classList.toggle('is-open', open);
  measureHeader();
  if (returnFocus) menu.focus();
}

menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') setMenu(false, true);
});
document.addEventListener('click', event => {
  if (!header.contains(event.target) && menu.getAttribute('aria-expanded') === 'true') setMenu(false);
});
narrowScreen.addEventListener('change', () => setMenu(false));

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
const telegramLink = document.querySelector('#open-telegram');
const whatsappLink = document.querySelector('#open-whatsapp');
const messengerLinks = createMessengerLinks();
if (telegramLink) telegramLink.href = messengerLinks.telegram;
if (whatsappLink) whatsappLink.href = messengerLinks.whatsapp;
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
  summary.textContent = describeProject(project);
}

config.addEventListener('input', event => {
  if (event.target === engineering) separateEngineering = engineering.checked;
  updateProject();
});

function updateDraftActions() {
  const empty = !draft.value.trim();
  copyButton.disabled = empty;
  downloadButton.disabled = empty;
}

// После восстановления страницы доступность копирования зависит от черновика.
window.addEventListener('pageshow', updateDraftActions);

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
root.classList.add('js-enabled');
measureHeader();
if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
else window.addEventListener('resize', measureHeader);
