<?php
namespace Stroy;
$e=fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
$val=fn($key)=>is_string($values[$key]??null)?$e($values[$key]):'';
$errors=$out['errors']??[];
$selectedExtras=is_array($values['extras']??null)?$values['extras']:[];
$err=function($key) use ($errors,$e) {return isset($errors[$key])?'<span class="field-error" id="error-'.$key.'">'.$e($errors[$key]).'</span>':'<span class="field-error" id="error-'.$key.'"></span>';};
$invalid=fn($key)=>isset($errors[$key])?' aria-invalid="true"':'';
?>
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><title>Обсудить проект — СтройИнжиниринг</title><link rel="icon" href="assets/favicon.svg"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="request.css"><script src="request.js" defer></script></head>
<body class="request-page"><a class="skip-link" href="#request-main">К форме</a><header><div class="wrap bar"><a class="logo" href="index.html">СТРОЙИНЖИНИРИНГ</a><a href="tel:+74991306616">+7 (499) 130-66-16</a></div></header><main id="request-main" class="wrap request-wrap"><a href="index.html#contact">К черновику и контактам</a><h1>Обсудить состав проекта</h1><p>Получатель: СтройИнжиниринг. Отправка не означает заключение договора или бронирование выезда.</p>
<p id="request-status" role="status" aria-live="polite" tabindex="-1"><?= $e($out['message']??'Заполните телефон и пожелания. Обязательные поля отмечены звёздочкой.') ?></p>
<?php if (!$enabled): ?><p>Можно подготовить состав на главной странице, скопировать его или скачать TXT. Здесь поля и отправка отключены.</p><?php endif; ?>
<form id="request-form" method="post" action="request.php" accept-charset="UTF-8" data-enabled="<?= $enabled?'true':'false' ?>">
<input type="hidden" name="csrf" value="<?= $e($ticket['csrf']??'') ?>"><input type="hidden" name="request_id" value="<?= $e($ticket['request_id']??'') ?>">
<div class="honeypot" aria-hidden="true"><label for="website">Оставьте это поле пустым</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<fieldset class="request-fields" <?= $enabled?'':'disabled' ?>><legend>Контакт и пожелания</legend>
<div class="f"><label for="request-name">Как к вам обращаться</label><input id="request-name" name="name" autocomplete="given-name" maxlength="80" value="<?= $val('name') ?>" aria-describedby="error-name"<?= $invalid('name') ?>><?= $err('name') ?></div>
<div class="f"><label for="request-phone">Телефон для ответа *</label><input id="request-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="40" value="<?= $val('phone') ?>" aria-describedby="error-phone"<?= $invalid('phone') ?>><?= $err('phone') ?></div>
<div class="f"><label for="request-message">Состав работ или вопрос *</label><textarea id="request-message" name="message" rows="9" maxlength="6000" required aria-describedby="message-help error-message"<?= $invalid('message') ?>><?= $val('message') ?></textarea><span class="note" id="message-help">Вставьте подготовленный черновик или опишите задачу. Не указывайте данные документов и точный адрес.</span><?= $err('message') ?></div>
<details class="request-options"><summary>Уточнить состав дома</summary><p>Необязательно. Можно оставить эти поля пустыми и описать задачу выше. Стоимость не рассчитывается.</p>
<div class="f"><label for="request-area">Площадь дома, м²</label><input id="request-area" type="number" name="area" min="60" max="400" step="5" value="<?= $val('area') ?>" aria-describedby="error-area"<?= $invalid('area') ?>><?= $err('area') ?></div>
<?php foreach (['kit'=>['Комплектация',KITS],'wall'=>['Материал стен',WALLS]] as $key=>[$label,$options]): ?><div class="f"><label for="request-<?= $key ?>"><?= $label ?></label><select id="request-<?= $key ?>" name="<?= $key ?>" aria-describedby="error-<?= $key ?>"<?= $invalid($key) ?>><option value="">Не выбрано</option><?php foreach($options as $keyValue=>$text): ?><option value="<?= $keyValue ?>" <?= ($values[$key]??'')===$keyValue?'selected':'' ?>><?= $e($text) ?></option><?php endforeach; ?></select><?= $err($key) ?></div><?php endforeach; ?>
<fieldset class="row"><legend>Дополнительные работы</legend><?php foreach(EXTRAS as $key=>$text): ?><label class="opt"><input type="checkbox" name="extras[]" value="<?= $key ?>" <?= in_array($key,$selectedExtras,true)?'checked':'' ?>><span><?= $e($text) ?></span></label><?php endforeach; ?><?= $err('extras') ?></fieldset></details>
<?php if($enabled): ?><label class="consent"><input name="consent" type="checkbox" value="1" required <?= ($values['consent']??'')==='1'?'checked':'' ?> aria-describedby="error-consent"><span><?= $e($config['consent_text']) ?> <a href="privacy.html" target="_blank" rel="noopener noreferrer">Данные и конфиденциальность</a></span></label><?= $err('consent') ?><?php endif; ?>
<?= $err('form') ?><button class="btn" type="submit" id="send-request">Отправить состав проекта</button>
</fieldset><?php if($enabled): ?><noscript><p class="note">Форма работает без JavaScript. После отправки откроется результат; обновление страницы не отправит обращение повторно.</p></noscript><?php endif; ?></form>
<p><a href="tel:+74991306616">Позвонить</a>{{MESSENGER_INLINE}}</p></main></body></html>
