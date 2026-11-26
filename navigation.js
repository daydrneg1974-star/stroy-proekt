// Навигация не зависит от конструктора, формы и модуля project.js.
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


root.classList.add('js-navigation');
menu.hidden = false;
measureHeader();
if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
else window.addEventListener('resize', measureHeader);
