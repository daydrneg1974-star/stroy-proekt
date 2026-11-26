# Состояние задач

Обновлено 26.11.2026. T01–T05 относятся к историческому варианту Sites; текущий выпуск SpaceWeb — T06. Историческая T04 заменена работой T06, её прежний журнал сохранён.

| Задача | Записанный статус |
|---|---|
| [T01](T01-demo-quality.md) | done |
| [T02](T02-script-cache.md) | done |
| [T03](T03-contact-reviews.md) | done |
| [T04](T04-messenger-requests.md) | in_progress |
| [T05](T05-privacy-minimization.md) | done |
| [T06](T06-contact-release.md) | needs_human |
| [T07](T07-reliability-local.md) | local_review; sending_disabled; not_published |

Телефон и WhatsApp опубликованы. Полная приёмка T06 и контакт Telegram остаются открытыми; подробности в docs/status.md.

Продолжение T07: [200% и TXT на диске проверены](T07-local-followup-20261126.md). Автоматический e2e блокируется отсутствующим Chromium; физическое устройство не проверено. Статус `local_review; sending_disabled; not_published` сохраняется.

Установка Chromium: [desktop e2e — 4/4 PASS](T07-e2e-acceptance-20261126.md), нативный запрет Clipboard подтверждён, Node — 45/45 PASS. Физический телефон — NOT RUN из-за отсутствия доступа к USB владельца. Общий статус T07 сохраняется до оставшейся приёмки.

Следующее продолжение: [PHP через настоящий браузер — 8/8 PASS](T07-php-browser-20261126.md), PHP — 69/69 PASS, Node — 45/45 PASS. Исправлена скрытая ошибка в закрытом блоке состава с JS и без JS. Подставной транспорт проверен, реальные письма не отправлялись. Телефон и внешние условия будущего выпуска остаются открытыми; `local_review; sending_disabled; not_published`.
