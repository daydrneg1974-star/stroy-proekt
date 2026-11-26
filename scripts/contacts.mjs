// Только предоставленные владельцем аккаунты. null означает отсутствие кнопки.
// Проверка синтаксиса не подтверждает существование или принадлежность аккаунта.
export function validateContacts(contacts) {
  if (!contacts || typeof contacts !== 'object' || Array.isArray(contacts)
    || Object.keys(contacts).sort().join(',') !== 'telegram,whatsapp') {
    throw new Error('contacts.json должен содержать только whatsapp и telegram.');
  }
  const patterns = {
    whatsapp: /^https:\/\/wa\.me\/[1-9]\d{7,14}$/,
    telegram: /^https:\/\/t\.me\/(?:[A-Za-z][A-Za-z0-9_]{4,31}|\+[1-9]\d{7,14})$/,
  };
  for (const [service, url] of Object.entries(contacts)) {
    if (url !== null && (typeof url !== 'string' || !patterns[service].test(url))) {
      throw new Error(`Недопустимый адрес ${service}: нужен прямой HTTPS URL без текста, query и hash или null.`);
    }
  }
  // Российские городские номера не являются допустимыми аккаунтами Telegram.
  if (contacts.telegram?.startsWith('https://t.me/+7') && !/^https:\/\/t\.me\/\+79\d{9}$/.test(contacts.telegram)) {
    throw new Error('Для Telegram нужен username или мобильный номер, не городской телефон.');
  }
  return contacts;
}

export function renderContacts(html, config) {
  const contacts = validateContacts(config);
  const channels = [
    { key: 'whatsapp', label: 'WhatsApp', policy: 'https://www.whatsapp.com/legal/privacy-policy' },
    { key: 'telegram', label: 'Telegram', policy: 'https://telegram.org/privacy' },
  ].filter(channel => contacts[channel.key]);
  const names = channels.map(channel => channel.label).join(' или ');
  const active = channels.length > 0;
  const replacements = {
    MESSENGER_INLINE: channels.map(channel => ` · <a href="${contacts[channel.key]}" target="_blank" rel="noopener noreferrer">Открыть ${channel.label}</a>`).join(''),
    CONTACT_LEAD: active
      ? `Подготовьте состав работ и пожелания. Скопируйте текст, откройте ${names}, вставьте и отправьте сообщение. Или позвоните, чтобы обсудить проект и выезд инженера.`
      : 'Позвоните, чтобы обсудить проект и выезд инженера. Состав работ и пожелания можно записать в черновик и сохранить на своём устройстве.',
    MESSENGER_STEPS: active
      ? `<ol class="note messenger-steps" id="messenger-help"><li>Скопируйте текст целиком — кнопкой ниже или вручную.</li><li>Откройте ${names}.</li><li>Вставьте текст в чат, проверьте его и нажмите «Отправить».</li></ol>` : '',
    MESSENGER_ACTIONS: active
      ? `<p class="note" id="messenger-recipient">Получатель: СтройИнжиниринг.</p><div class="draft-actions" role="group" aria-label="Связаться в мессенджере">${channels.map(channel => `<a class="btn" id="open-${channel.key}" href="${contacts[channel.key]}" target="_blank" rel="noopener noreferrer" aria-describedby="messenger-help messenger-recipient">Открыть ${channel.label}</a>`).join('')}</div><p class="note">Ссылки открывают чат без текста. Если чат не открывается, позвоните. Переход в чат не подтверждает отправку или доставку сообщения.</p>` : '',
    NOSCRIPT_GUIDANCE: active
      ? `JavaScript отключён: ссылки открывают чат без текста. Запишите состав, скопируйте его вручную, откройте ${names} и вставьте текст. Затем нажмите «Отправить». Кнопки копирования и скачивания TXT недоступны.`
      : 'JavaScript отключён. Запишите состав проекта и скопируйте его вручную. Позвоните, чтобы обсудить проект. Кнопки копирования и скачивания TXT недоступны.',
    MESSENGER_FAQ: active
      ? ` или <a href="#contact">подготовьте заявку ниже</a>. Скопируйте текст, откройте ${names}, вставьте его и нажмите «Отправить», чтобы обсудить задачу и согласовать выезд инженера.`
      : ', чтобы обсудить задачу и согласовать выезд инженера.',
    MESSENGER_DRAFT: active
      ? ' Ссылки мессенджеров не содержат черновик: вы сами копируете, вставляете и отправляете текст.' : '',
    MESSENGER_SUMMARY: active
      ? `При переходе в ${names} сервис получает технический запрос; дальнейшая работа с данными регулируется его правилами. ` : '',
    MESSENGER_PRIVACY: active
      ? `<h2>${channels.map(channel => channel.label).join(' и ')}</h2>
 <p>Ссылки в разделе контактов открывают мессенджер для обращения в СтройИнжиниринг. Черновик не включается в адрес ссылки, параметры запроса или фрагмент URL.</p>
 <ol><li>Скопируйте текст целиком.</li><li>Откройте нужный мессенджер.</li><li>Вставьте текст в чат, проверьте его и нажмите «Отправить».</li></ol>
 <p>При переходе внешний сервис получает технический запрос, в том числе IP-адрес и сведения о браузере. Вставку и отправку сообщения вы выполняете самостоятельно; дальше действуют правила выбранного сервиса. Сайт не получает подтверждение отправки или доставки.</p>
 <ul>${channels.map(channel => `<li><a href="${channel.policy}" target="_blank" rel="noopener noreferrer">Политика конфиденциальности ${channel.label}</a></li>`).join('')}</ul>` : '',
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!Object.hasOwn(replacements, name)) throw new Error(`Неизвестный маркер ${name}`);
    return replacements[name];
  });
}
