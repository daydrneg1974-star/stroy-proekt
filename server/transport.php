<?php
declare(strict_types=1);
namespace Stroy;
function makeMailer(array $c, string $body): \PHPMailer\PHPMailer\PHPMailer {
    foreach (['Exception','PHPMailer','SMTP'] as $class) require_once __DIR__.'/vendor/phpmailer/phpmailer/src/'.$class.'.php';
    $m=new \PHPMailer\PHPMailer\PHPMailer(true);
    $m->isSMTP(); $m->SMTPDebug=0; $m->Host=$c['smtp_host']; $m->Port=$c['smtp_port'];
    $m->SMTPAuth=true; $m->SMTPSecure=\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $m->Username=$c['smtp_user']; $m->Password=$c['smtp_password'];
    $m->SMTPOptions=['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false]];
    $m->Timeout=3; $m->getSMTPInstance()->Timelimit=3;
    $m->CharSet='UTF-8'; $m->setFrom($c['from'],'СтройИнжиниринг'); $m->addAddress($c['recipient']);
    $m->Subject='Состав проекта — СтройИнжиниринг'; $m->isHTML(false); $m->Body=$body;
    return $m;
}
