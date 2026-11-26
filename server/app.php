<?php
declare(strict_types=1);
namespace Stroy;

const KITS = ['shell'=>'Коробка: фундамент, стены, кровля', 'prepared'=>'Под чистовую: коробка, инженерия и сети', 'turnkey'=>'Под ключ: коробка, инженерия, сети и отделка'];
const WALLS = ['aerated'=>'Газобетон D400', 'ceramic'=>'Керамоблок 38'];
const EXTRAS = ['bath'=>'Банный комплекс','pool'=>'Бетонный бассейн','engineering'=>'Инженерия: ввод сетей и котельная','gas'=>'Газификация','epdm'=>'EPDM-покрытие','landscape'=>'Благоустройство участка','pond'=>'Декоративный пруд'];

function validConfig(array $c, string $public): bool {
    if (($c['enabled']??false)!==true || ($c['privacy_ready']??false)!==true || ($c['smtp_port']??null)!==465) return false;
    foreach (['recipient','from','smtp_host','smtp_user','smtp_password','secret','storage','consent_text','origin'] as $key) {
        if (!is_string($c[$key]??null) || trim($c[$key])==='') return false;
    }
    foreach (['recipient','from'] as $key) if (!filter_var($c[$key],FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/',$c[$key])) return false;
    if (!preg_match('/\A[a-zA-Z0-9.-]+\z/',$c['smtp_host']) || strlen($c['secret'])<32) return false;
    if ($c['origin']!=='https://stroyinzh-dom.ru' && !preg_match('#\Ahttp://(?:127\.0\.0\.1|localhost):[0-9]+\z#',$c['origin'])) return false;
    $storage=$c['storage'];
    if (!str_starts_with($storage,DIRECTORY_SEPARATOR) || str_contains($storage,'..') || str_contains($storage,'//') || preg_match('#(?:^|/)\.(?:/|$)#',$storage)) return false;
    // Reject symlinks in every existing path component, including an indirect route into public_html.
    for ($p=$storage; $p!==dirname($p); $p=dirname($p)) if (is_link($p)) return false;
    $web=rtrim(realpath($public)?:$public,DIRECTORY_SEPARATOR);
    $storage=rtrim($storage,DIRECTORY_SEPARATOR);
    return $storage!=='' && $storage!==$web && !str_starts_with($storage,$web.DIRECTORY_SEPARATOR);
}

function blank(string $s): bool { return preg_match('/\A\s*\z/u', $s) === 1; }
function result(int $status, string $code, string $message, array $errors=[]): array {
    return compact('status','code','message','errors');
}
function validate(array $input): array {
    $errors=[]; $data=[];
    $allowed=['name','phone','message','area','kit','wall','extras','website','csrf','request_id','consent'];
    if (array_diff(array_keys($input),$allowed)) $errors['form']='В запросе есть неизвестные поля.';
    foreach (['name'=>80,'phone'=>40,'message'=>6000,'area'=>3,'kit'=>16,'wall'=>16,'website'=>200,'csrf'=>64,'request_id'=>64,'consent'=>1] as $field=>$max) {
        $value=$input[$field]??'';
        if (!is_string($value) || !mb_check_encoding($value,'UTF-8') || mb_strlen($value,'UTF-8')>$max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$value)) {
            $errors[$field]='Проверьте формат и длину поля.'; $value='';
        }
        $data[$field]=$value;
    }
    foreach (['name','phone','area','kit','wall'] as $f) if (preg_match('/[\r\n]/',$data[$f])) $errors[$f]='Переносы строк в этом поле недопустимы.';
    if (!preg_match('/\A\+?[0-9 ()-]{10,40}\z/D',$data['phone']) || !preg_match('/\A\d{10,15}\z/',preg_replace('/\D/','',$data['phone']))) $errors['phone']='Укажите телефон: от 10 до 15 цифр.';
    if (blank($data['message'])) $errors['message']='Напишите состав работ или вопрос.';
    if ($data['consent']!=='1') $errors['consent']='Для отправки необходимо согласие.';
    if ($data['website']!=='') $errors['form']='Не удалось проверить запрос. Свяжитесь по телефону.';
    $extras=$input['extras']??[];
    if (!is_array($extras) || !array_is_list($extras) || count($extras)>count(EXTRAS)) { $errors['extras']='Проверьте список работ.'; $extras=[]; }
    foreach ($extras as $e) if (!is_string($e) || !array_key_exists($e,EXTRAS)) $errors['extras']='Выбрана неизвестная работа.';
    $data['extras']=array_values(array_unique(array_filter($extras,'is_string')));
    if ($data['area']!=='') {
        if (!ctype_digit($data['area']) || (int)$data['area']<60 || (int)$data['area']>400 || (int)$data['area']%5!==0) $errors['area']='Площадь: от 60 до 400 м², шаг 5 м².';
        if (!array_key_exists($data['kit'],KITS)) $errors['kit']='Выберите комплектацию.';
        if (!array_key_exists($data['wall'],WALLS)) $errors['wall']='Выберите материал стен.';
    } elseif ($data['kit']!=='' || $data['wall']!=='' || $data['extras']) $errors['area']='Укажите площадь для выбранного состава проекта.';
    if (!preg_match('/\A[a-f0-9]{32}\z/',$data['request_id'])) $errors['form']='Обновите форму и повторите ввод.';
    return [$data,$errors];
}
function describe(array $d): string {
    $lines=['Обращение с сайта СтройИнжиниринг', 'Телефон для ответа: '.$d['phone']];
    if ($d['name']!=='') $lines[]='Как обращаться: '.$d['name'];
    if ($d['area']!=='') {
        $extra=$d['extras'];
        if ($d['kit']!=='shell') $extra=array_values(array_diff($extra,['engineering']));
        $lines=array_merge($lines,['','Состав проекта','Площадь дома: '.$d['area'].' м²','Комплектация: '.KITS[$d['kit']], 'Материал стен: '.WALLS[$d['wall']], 'Дополнительно: '.($extra?implode('; ',array_map(fn($e)=>EXTRAS[$e],$extra)):'не выбрано')]);
    }
    return implode("\n",array_merge($lines,['','Пожелания:',$d['message'],'','Предварительный состав работ. Стоимость и сроки не рассчитаны. Не договор и не бронирование выезда.']));
}

/** A single locked ledger bounds concurrent requests. No raw IP, message or phone is stored. */
final class Ledger {
    public function __construct(private string $directory, private string $secret) {
        if (strlen($secret)<32) throw new \RuntimeException('configuration');
        if (!is_dir($directory) && !mkdir($directory,0700,true) && !is_dir($directory)) throw new \RuntimeException('storage');
        if (is_link($directory)) throw new \RuntimeException('storage');
    }
    private function transaction(callable $fn): mixed {
        $path=$this->directory.'/ledger.json';
        if (is_link($path)) throw new \RuntimeException('storage');
        $h=fopen($path,'c+');
        if (!$h) throw new \RuntimeException('storage');
        chmod($path,0600); $locked=false;
        try {
            for ($i=0;$i<20;$i++) { if (flock($h,LOCK_EX|LOCK_NB)) { $locked=true;break; } usleep(10000); }
            if (!$locked || fstat($h)['size']>2097152) throw new \RuntimeException('storage_busy');
            $raw=stream_get_contents($h);
            $s=$raw===''?['rates'=>[],'requests'=>[]]:json_decode($raw,true,32,JSON_THROW_ON_ERROR);
            if (!isset($s['rates'],$s['requests']) || !is_array($s['rates']) || !is_array($s['requests'])) throw new \RuntimeException('storage');
            $answer=$fn($s);
            $bytes=json_encode($s,JSON_THROW_ON_ERROR); rewind($h);
            if (fwrite($h,$bytes)!==strlen($bytes) || !ftruncate($h,strlen($bytes)) || !fflush($h)) throw new \RuntimeException('storage');
            return $answer;
        } finally { if ($locked) flock($h,LOCK_UN); fclose($h); }
    }
    public function reserve(string $ip,string $requestId,string $body,int $now): array {
        $client=hash_hmac('sha256',$ip,$this->secret);
        $id=hash_hmac('sha256',$client.'|'.$requestId,$this->secret);
        $digest=hash_hmac('sha256',$client.'|'.$body,$this->secret);
        return $this->transaction(function (&$s) use ($client,$id,$digest,$now) {
            $s['rates']=array_filter($s['rates'],fn($r)=>($r['until']??0)>$now);
            $s['requests']=array_filter($s['requests'],fn($r)=>($r['until']??0)>$now);
            if (isset($s['requests'][$id])) {
                $old=$s['requests'][$id];
                return ['state'=>hash_equals($old['digest'],$digest)?$old['state']:'conflict','id'=>$id];
            }
            foreach($s['requests'] as $old) if(hash_equals($old['digest'],$digest)) return ['state'=>$old['state'],'id'=>$id];
            if (count($s['requests'])>=2000 || count($s['rates'])>=2000) return ['state'=>'rate','id'=>$id];
            foreach ([$client, 'global'] as $key) {
                $s['rates'][$key]??=['until'=>$now+3600,'count'=>0];
                if ($s['rates'][$key]['count']>=($key==='global'?100:5)) return ['state'=>'rate','id'=>$id];
            }
            foreach([$client,'global'] as $key) $s['rates'][$key]['count']++;
            $s['requests'][$id]=['digest'=>$digest,'state'=>'pending','until'=>$now+86400];
            return ['state'=>'new','id'=>$id];
        });
    }
    public function finish(string $id,string $state): void {
        $this->transaction(function (&$s) use ($id,$state) { if (isset($s['requests'][$id])) $s['requests'][$id]['state']=$state; });
    }
}

function submit(array $input,array $server,array $config,array $ticket,callable $transport,?int $now=null): array {
    $now??=time();
    if (($server['REQUEST_METHOD']??'')!=='POST') return result(405,'method','Используйте форму отправки.');
    if (($config['enabled']??false)!==true) return result(503,'disabled','Отправка через сайт пока недоступна. Позвоните по номеру, указанному на странице.');
    if (($server['CONTENT_LENGTH']??0)>32768) return result(413,'size','Текст запроса слишком большой.');
    if (strtolower(trim(explode(';',$server['CONTENT_TYPE']??'')[0]))!=='application/x-www-form-urlencoded') return result(415,'format','Недопустимый формат запроса.');
    $origin=$server['HTTP_ORIGIN']??'';
    if ($origin==='' && isset($server['HTTP_REFERER'])) { $u=parse_url($server['HTTP_REFERER']);$origin=($u['scheme']??'').'://'.($u['host']??'').(isset($u['port'])?':'.$u['port']:''); }
    if ($origin!==($config['origin']??null) || ($server['HTTP_SEC_FETCH_SITE']??'same-origin')==='cross-site') return result(403,'origin','Откройте форму на сайте и повторите действие.');
    if (!is_string($input['csrf']??null) || !is_string($ticket['csrf']??null) || !hash_equals($ticket['csrf'],$input['csrf']) || ($ticket['expires']??0)<$now || !is_string($input['request_id']??null) || !hash_equals($ticket['request_id']??'',$input['request_id'])) return result(403,'csrf','Срок формы истёк. Сохраните текст и обновите страницу.');
    [$d,$errors]=validate($input);
    if ($errors) return result(422,'validation','Проверьте отмеченные поля.',$errors);
    try {
        $ledger=new Ledger($config['storage'],$config['secret']);
        $body=describe($d);
        $reservation=$ledger->reserve($server['REMOTE_ADDR']??'unknown',$d['request_id'],$body,$now);
        $state=$reservation['state'];
        if ($state==='accepted') return result(200,'accepted','Сообщение уже принято почтовым сервером. Повторно не отправлялось. Получение адресатом пока не подтверждено.');
        if ($state==='rate') return result(429,'rate','Слишком много попыток. Подождите до часа или позвоните.');
        if ($state==='conflict') return result(409,'conflict','Эта отправка уже использована. Для нового обращения откройте новую форму.');
        if ($state!=='new') return result(409,'uncertain','Предыдущая попытка уже выполнялась. Результат не подтверждён; уточните его по телефону перед повторной отправкой.');
        // Mark before entering SMTP. Any timeout/crash leaves a durable pending record.
        try { $accepted=$transport($body); } catch (\Throwable) { $accepted=false; }
        $ledger->finish($reservation['id'],$accepted===true?'accepted':'uncertain');
        return $accepted===true
            ? result(200,'accepted','Сообщение принято почтовым сервером. Получение адресатом пока не подтверждено.')
            : result(503,'transport','Отправка не подтверждена. Текст сохранён. Уточните результат по телефону перед повторной отправкой.');
    } catch (\Throwable) { return result(503,'temporary','Отправка временно недоступна. Текст сохранён; воспользуйтесь телефоном.'); }
}
