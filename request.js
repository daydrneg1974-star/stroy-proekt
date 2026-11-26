const form = document.querySelector('#request-form');
if (form && form.dataset.enabled === 'true') {
  const button = document.querySelector('#send-request');
  const status = document.querySelector('#request-status');
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    button.disabled = true;
    status.textContent = 'Отправляем обращение…';
    form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach(error => { error.textContent = ''; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(form.action, {
        method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(new FormData(form)), signal: controller.signal,
      });
      const result = await response.json();
      if (typeof result.message !== 'string') throw new Error('Unexpected response');
      status.textContent = result.message;
      for (const [name, message] of Object.entries(result.errors || {})) {
        const field = form.elements.namedItem(name);
        const error = document.getElementById(`error-${name}`);
        if (field instanceof HTMLElement) field.setAttribute('aria-invalid', 'true');
        if (error && typeof message === 'string') error.textContent = message;
      }
      if (response.ok && result.code === 'accepted') {
        form.reset();
        button.disabled = true;
        status.textContent += ' Для нового обращения откройте форму заново.';
      } else button.disabled = false;
      const firstError = form.querySelector('[aria-invalid="true"]');
      (firstError || status).focus();
    } catch {
      status.textContent = 'Ответ сервера не получен. Текст сохранён. Отправка могла состояться: уточните результат по телефону перед повтором.';
      button.disabled = false;
      status.focus();
    } finally { clearTimeout(timeout); pending = false; }
  });
}
