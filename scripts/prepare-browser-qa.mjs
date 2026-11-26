// Local fixtures only. Not part of either release allowlist. Never contacts SMTP.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('.qa-preview/private-test');await mkdir(root,{recursive:true});
for(const file of ['app.php','form.php'])await copyFile(`dist/private/${file}`,`${root}/${file}`);
let bootstrap=await readFile('dist/private/bootstrap.php','utf8');
const call='fn($body)=>makeMailer($config,$body)->send()';
if(!bootstrap.includes(call))throw Error('SMTP injection seam changed: review the fixture');
bootstrap=bootstrap.replace("require_once __DIR__.'/transport.php';",'// Isolated fake transport: no mail library is loaded.').replace(call,`function($body){file_put_contents(__DIR__.'/calls.txt',"accepted\\n",FILE_APPEND|LOCK_EX);return true;}`);
await writeFile(`${root}/bootstrap.php`,bootstrap);
let form=await readFile(`${root}/form.php`,'utf8');
form=form.replaceAll('href="styles.css','href="/styles.css').replaceAll('href="request.css','href="/request.css').replaceAll('src="request.js','src="/request.js').replaceAll('href="assets/','href="/assets/').replaceAll('href="index.html','href="/index.html').replaceAll('href="privacy.html','href="/privacy.html').replace('<main id="request-main"','<p>ЛОКАЛЬНЫЙ ТЕСТ: подставной транспорт, писем нет.</p><main id="request-main"');
await writeFile(`${root}/form.php`,form);
const phpQuote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
await writeFile(`${root}/config.php`,`<?php return ['enabled'=>true,'privacy_ready'=>true,'smtp_port'=>465,'recipient'=>'recipient@example.invalid','from'=>'sender@example.invalid','smtp_host'=>'smtp.example.invalid','smtp_user'=>'test','smtp_password'=>'test-only','secret'=>str_repeat('t',64),'storage'=>${phpQuote(root+'/runtime')},'consent_text'=>'Тестовое согласие с синтетическими данными','origin'=>'http://127.0.0.1:4173'];`);
console.log('Created isolated QA form: /__qa/form/request.php. Production sending remains disabled.');
