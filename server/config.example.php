<?php
// Copy as config.php OUTSIDE public_html. Never commit actual values.
return [
    'enabled' => false,
    'origin' => 'https://stroyinzh-dom.ru',
    'recipient' => '',
    'from' => '',
    'smtp_host' => 'smtp.spaceweb.ru',
    'smtp_port' => 465,
    'smtp_user' => '',
    'smtp_password' => '',
    'secret' => '', // php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
    'storage' => __DIR__ . '/runtime',
    // Fill ONLY with approved operator/processing wording before enabling.
    'privacy_ready' => false,
    'consent_text' => '',
];
