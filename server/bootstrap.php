<?php
declare(strict_types=1);
namespace Stroy;
require_once __DIR__.'/app.php';
require_once __DIR__.'/transport.php';
set_time_limit(10);
ini_set('display_errors','0'); ini_set('log_errors','0');
header('Cache-Control: no-store, max-age=0'); header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin'); header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'");
$rid=bin2hex(random_bytes(8));
$base=['enabled'=>false];
try {
    $path=getenv('STROY_FORM_CONFIG')?:__DIR__.'/config.php';
    $web=realpath($_SERVER['DOCUMENT_ROOT']??'')?:'';
    $resolved=realpath($path);
    if ($resolved && ($web==='' || !str_starts_with($resolved,$web.DIRECTORY_SEPARATOR))) {
        $loaded=require $resolved; if (is_array($loaded)) $base=$loaded;
    }
} catch (\Throwable) { $base=['enabled'=>false]; }
$config=$base;
$enabled=validConfig($config,realpath($_SERVER['DOCUMENT_ROOT']??'')?:dirname(__DIR__).'/public_html');
$config['enabled']=$enabled;
$json=str_contains($_SERVER['HTTP_ACCEPT']??'','application/json');
$method=$_SERVER['REQUEST_METHOD']??'GET'; $values=[]; $out=null; $ticket=[];
if (!in_array($method,['GET','POST'],true)) {
    header('Allow: GET, POST'); http_response_code(405); echo 'Используйте форму отправки.'; exit;
}
if ($method==='POST' && ((int)($_SERVER['CONTENT_LENGTH']??0)>32768 || strlen(file_get_contents('php://input',false,null,0,32769))>32768)) {
    http_response_code(413); header('Content-Type: '.($json?'application/json':'text/plain').'; charset=utf-8');
    echo $json?json_encode(result(413,'size','Текст запроса слишком большой.'),JSON_UNESCAPED_UNICODE):'Текст запроса слишком большой. Вернитесь назад и сократите текст.';exit;
}
if ($enabled) {
    try {
        $sessionDir=$config['storage'].'/sessions';
        if (!is_dir($sessionDir) && !mkdir($sessionDir,0700,true) && !is_dir($sessionDir)) throw new \RuntimeException('storage');
        if (is_link($sessionDir)) throw new \RuntimeException('storage');
        foreach (array_slice(glob($sessionDir.'/sess_*')?:[],0,500) as $file) if (!is_link($file) && filemtime($file)<time()-900) unlink($file);
        session_name('stroy_form');
        session_start(['use_strict_mode'=>1,'use_only_cookies'=>1,'save_path'=>$sessionDir,'gc_maxlifetime'=>900,'cookie_lifetime'=>0,'cookie_httponly'=>true,'cookie_samesite'=>'Lax','cookie_secure'=>str_starts_with($config['origin'],'https://')]);
        if (!isset($_SESSION['ticket']) || ($_SESSION['ticket']['expires']??0)<time()) $_SESSION['ticket']=['csrf'=>bin2hex(random_bytes(32)),'request_id'=>bin2hex(random_bytes(16)),'expires'=>time()+900];
        $ticket=$_SESSION['ticket'];
        if ($method==='POST') {
            $out=submit($_POST,$_SERVER,$config,$ticket,fn($body)=>makeMailer($config,$body)->send());
            $out['requestId']=$rid;
            if ($out['status']>=500) error_log(json_encode(['request_id'=>$rid,'code'=>$out['code']]));
            if ($out['code']==='accepted') { $values=[]; unset($_SESSION['ticket']); }
            else foreach(['name','phone','message','area','kit','wall','extras','consent'] as $f) {
                $v=$_POST[$f]??'';
                if ($f!=='extras' && is_string($v) && strlen($v)<=24000 && mb_check_encoding($v,'UTF-8')) $values[$f]=$v;
                if ($f==='extras') $values[$f]=is_array($v)?array_values(array_filter($v,fn($e)=>is_string($e)&&array_key_exists($e,EXTRAS))):[];
            }
            if (!$json) $_SESSION['flash']=['result'=>$out,'values'=>$values,'expires'=>time()+900];
            session_write_close();
            if ($json) { http_response_code($out['status']);if($out['status']===429)header('Retry-After: 3600'); header('Content-Type: application/json; charset=utf-8');echo json_encode($out,JSON_UNESCAPED_UNICODE);exit; }
            header('Location: request.php',true,303);exit;
        }
        if (isset($_SESSION['flash'])) {
            if ($_SESSION['flash']['expires']>=time()) { $out=$_SESSION['flash']['result'];$values=$_SESSION['flash']['values']; }
            if (($out['code']??'')==='accepted' || ($_SESSION['flash']['expires']??0)<time()) unset($_SESSION['flash']);
        }
        session_write_close();
    } catch (\Throwable) { $enabled=false;$config['enabled']=false;error_log(json_encode(['request_id'=>$rid,'code'=>'configuration'])); }
}
if (!$enabled) {
    $out=result(503,'disabled','Отправка через сайт пока недоступна. Позвоните по номеру, указанному на странице.');
    $out['requestId']=$rid;
    if ($method==='POST' && $json) {http_response_code(503);header('Content-Type: application/json; charset=utf-8');echo json_encode($out,JSON_UNESCAPED_UNICODE);exit;}
}
http_response_code($out['status']??200);header('Content-Type: text/html; charset=utf-8');
require __DIR__.'/form.php';
