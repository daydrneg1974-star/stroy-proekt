<?php
declare(strict_types=1);
// This file is public. Application, SMTP settings, dependencies and runtime are siblings of public_html.
$app=dirname(__DIR__).'/private/bootstrap.php';
if (!is_file($app)) {
    http_response_code(503); header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');header('X-Content-Type-Options: nosniff');
    echo '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Связь — СтройИнжиниринг</title><link rel="stylesheet" href="privacy.css"><main class="wrap"><h1>Отправка пока недоступна</h1><p>Используйте телефон или WhatsApp. Ничего не отправлено.</p><a href="index.html#contact">К контактам и черновику</a></main></html>';exit;
}
require $app;
