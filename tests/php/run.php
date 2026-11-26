<?php
declare(strict_types=1);
require __DIR__.'/../../server/app.php';
require __DIR__.'/../../server/transport.php';
use function Stroy\submit;
use function Stroy\validate;
use function Stroy\describe;
$passed=0;
function check(bool $yes,string $label): void { global $passed;if(!$yes)throw new RuntimeException($label);echo "PASS $label\n";$passed++; }
$dir=sys_get_temp_dir().'/stroy-tests-'.bin2hex(random_bytes(6));mkdir($dir,0700);
$valid=['enabled'=>true,'privacy_ready'=>true,'smtp_port'=>465,'recipient'=>'recipient@example.invalid','from'=>'sender@example.invalid','smtp_host'=>'smtp.example.invalid','smtp_user'=>'test','smtp_password'=>'test','secret'=>str_repeat('s',64),'storage'=>$dir.'/private','consent_text'=>'Только тест','origin'=>'https://stroyinzh-dom.ru'];
mkdir($dir.'/public');
check(Stroy\validConfig($valid,$dir.'/public'),'valid complete configuration');
foreach (['smtp_host'=>[],'recipient'=>null,'secret'=>123,'origin'=>[],'storage'=>$dir.'/public','privacy_ready'=>false] as $key=>$value) check(!Stroy\validConfig(array_replace($valid,[$key=>$value]),$dir.'/public'),'invalid configuration '.$key.' fails closed');
symlink($dir.'/public',$dir.'/alias');check(!Stroy\validConfig(array_replace($valid,['storage'=>$dir.'/alias/runtime']),$dir.'/public'),'symlink ancestor cannot expose storage');unlink($dir.'/alias');
$now=1800000000;
$c=['enabled'=>true,'origin'=>'https://stroyinzh-dom.ru','storage'=>$dir,'secret'=>str_repeat('s',64)];
$ticket=['csrf'=>str_repeat('c',64),'request_id'=>str_repeat('a',32),'expires'=>$now+900];
$d=['name'=>'Тест','phone'=>'+7 (000) 000-00-00','message'=>'Сохранить ёлку.\nТерраса 20 м² 🌳','area'=>'160','kit'=>'turnkey','wall'=>'aerated','extras'=>['pond','engineering'],'csrf'=>$ticket['csrf'],'request_id'=>$ticket['request_id'],'website'=>'','consent'=>'1'];
$server=['REQUEST_METHOD'=>'POST','CONTENT_TYPE'=>'application/x-www-form-urlencoded;charset=UTF-8','CONTENT_LENGTH'=>1000,'HTTP_ORIGIN'=>$c['origin'],'REMOTE_ADDR'=>'192.0.2.1'];
$calls=0;$body='';$fake=function($text)use(&$calls,&$body){$calls++;$body=$text;return true;};
$run=fn($data,$s=null,$config=null,$t=null)=>submit($data,$s??$server,$config??$c,$t??$ticket,$fake,$now);
$r=$run($d);check($r['status']===200&&$r['code']==='accepted'&&$calls===1,'valid Unicode accepted by fake transport');check(str_contains($body,'Декоративный пруд')&&substr_count(mb_strtolower($body),'инженерия')===1,'server canonical composition without engineering duplication');
check($run($d)['code']==='accepted'&&$calls===1,'same nonce does not send twice');
$other=$d;$other['message']='Другое';check($run($other)['status']===409&&$calls===1,'same nonce with changed payload conflicts');
foreach ([['phone'=>''],['phone'=>[]],['phone'=>"+70000000000\r\nBcc:a@example.invalid"],['name'=>"Тест\nBcc:x"],['message'=>" \t\n\u{00A0}"],['message'=>str_repeat('ё',6001)],['message'=>"bad\xff"],['area'=>'59'],['area'=>'401'],['area'=>'161'],['kit'=>'__proto__'],['wall'=>'brick'],['extras'=>['unknown']],['extras'=>[['pool']]],['recipient'=>'x@example.invalid'],['website'=>'bot'],['consent'=>'0']] as $change) {
 $r=$run(array_replace($d,$change));check($r['status']===422,'validation '.implode(',',array_keys($change)));
}
check($calls===1,'invalid inputs never call transport');
check($run($d,array_replace($server,['REQUEST_METHOD'=>'GET']))['status']===405,'POST only');
check($run($d,array_replace($server,['CONTENT_TYPE'=>'application/json']))['status']===415,'content type');
check($run($d,array_replace($server,['CONTENT_TYPE'=>'application/x-www-form-urlencodedBAD']))['status']===415,'content type must match exactly');
check($run($d,array_replace($server,['CONTENT_LENGTH'=>32769]))['status']===413,'body limit');
check($run($d,array_replace($server,['HTTP_ORIGIN'=>'https://attacker.invalid']))['status']===403,'foreign origin rejected');
check($run($d,array_replace($server,['HTTP_ORIGIN'=>'null']))['status']===403,'null origin rejected');
check($run($d,array_replace($server,['HTTP_SEC_FETCH_SITE'=>'cross-site']))['status']===403,'cross site rejected');
check($run(array_replace($d,['csrf'=>'bad']))['status']===403,'csrf mismatch');
check($run($d,null,null,array_replace($ticket,['expires'=>$now-1]))['status']===403,'expired ticket');
check($run($d,null,['enabled'=>false])['status']===503&&$calls===1,'disabled configuration fails closed');
$ref=$server;unset($ref['HTTP_ORIGIN']);$ref['HTTP_REFERER']='https://stroyinzh-dom.ru/request.php';check($run($d,$ref)['code']==='accepted','same-origin referrer fallback');
$ref['HTTP_REFERER']='https://stroyinzh-dom.ru.attacker.invalid/request.php';check($run($d,$ref)['status']===403,'lookalike referer rejected');
$newD=$d;$newD['request_id']=str_repeat('b',32);$newT=$ticket;$newT['request_id']=$newD['request_id'];check($run($newD,null,null,$newT)['code']==='accepted'&&$calls===1,'same content with new token deduplicated');
for($i=1;$i<=5;$i++){
 $v=$d;$v['request_id']=str_pad(dechex($i),32,'0',STR_PAD_LEFT);$v['message']='Вариант '.$i;$t=array_replace($ticket,['request_id'=>$v['request_id']]);
 $r=$run($v,null,null,$t);check($r['status']===($i<5?200:429),'per-client rate '.$i);
}
$raw=file_get_contents($dir.'/ledger.json');check(!str_contains($raw,$d['phone'])&&!str_contains($raw,$d['name'])&&!str_contains($raw,$server['REMOTE_ADDR']),'ledger stores hashes and states only');
$badConfig=array_replace($c,['storage'=>$dir.'/bad']);mkdir($badConfig['storage']);file_put_contents($badConfig['storage'].'/ledger.json','broken');check($run($d,null,$badConfig)['status']===503,'corrupt ledger fails closed');
foreach(['rejection','timeout'] as $mode){
 $cfg=array_replace($c,['storage'=>$dir.'/'.$mode]);$cnt=0;$fail=function()use(&$cnt,$mode){$cnt++;if($mode==='timeout')throw new RuntimeException('SMTP sensitive secret');return false;};
 $r=submit($d,$server,$cfg,$ticket,$fail,$now);check($r['status']===503&&!str_contains(json_encode($r),'sensitive'),'transport '.$mode.' has no false success or diagnostics');
 $r=submit($d,$server,$cfg,$ticket,$fail,$now);check($r['status']===409&&$cnt===1,'uncertain attempt never automatically retried '.$mode);
}
$cfg=array_replace($c,['storage'=>$dir.'/expiry']);$callsExpiry=0;$send=function()use(&$callsExpiry){$callsExpiry++;return true;};submit($d,$server,$cfg,$ticket,$send,$now);$later=$now+86401;submit($d,$server,$cfg,array_replace($ticket,['expires'=>$later+900]),$send,$later);check($callsExpiry===2,'expired ledger records cleaned');
// Concurrent processes reserve one delivery before entering the fake transport.
if(!function_exists('pcntl_fork'))throw new RuntimeException('pcntl required for concurrency test');
$cfg=array_replace($c,['storage'=>$dir.'/parallel']);$children=[];
for($i=0;$i<8;$i++){ $pid=pcntl_fork();if($pid===0){$fakeParallel=function()use($dir){file_put_contents($dir.'/calls','one\n',FILE_APPEND|LOCK_EX);usleep(100000);return true;};$r=submit($d,$server,$cfg,$ticket,$fakeParallel,$now);exit(in_array($r['status'],[200,409],true)?0:1);} $children[]=$pid; }
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'parallel worker result');}
check(file_get_contents($dir.'/calls')==='one\n','8 parallel requests produce exactly one transport call');
// Exercise real pinned PHPMailer MIME preparation, never send().
$mail=Stroy\makeMailer(['smtp_host'=>'smtp.example.invalid','smtp_port'=>465,'smtp_user'=>'sender@example.invalid','smtp_password'=>'unit-only','from'=>'sender@example.invalid','recipient'=>'recipient@example.invalid'],describe($d));
check($mail->preSend(),'PHPMailer MIME preparation');$mime=$mail->getSentMIMEMessage();check(str_contains($mime,'To: recipient@example.invalid')&&str_contains($mime,'From:')&&!str_contains($mime,'Bcc:'),'recipient and sender fixed by server');check($mail->SMTPOptions['ssl']['verify_peer']&&$mail->SMTPOptions['ssl']['verify_peer_name']&&!$mail->SMTPOptions['ssl']['allow_self_signed'],'TLS verification enabled');
function renderForm(array $values): string {$enabled=true;$config=['consent_text'=>'Тест'];$ticket=[];$out=null;ob_start();require __DIR__.'/../../server/form.php';return ob_get_clean();}
$html=renderForm(['message'=>'<script>test</script>','extras'=>'wrong type']);
check(str_contains($html,'id="send-request"')&&str_contains($html,'&lt;script&gt;test&lt;/script&gt;'),'error form renders fully and escapes values even with malformed extras');
check(str_contains($html,'name="referrer" content="same-origin"')&&str_contains($html,'method="post" action="request.php"'),'native POST retains same-origin provenance');
echo json_encode(['passed'=>$passed,'realMessages'=>0,'phpmailer'=>\PHPMailer\PHPMailer\PHPMailer::VERSION],JSON_UNESCAPED_UNICODE)."\n";
function removeTree($path){foreach(scandir($path) as $x)if($x!=='.'&&$x!=='..'){ $p=$path.'/'.$x;is_dir($p)?removeTree($p):unlink($p);}rmdir($path);}removeTree($dir);
