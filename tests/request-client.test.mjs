import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../request.js',import.meta.url),'utf8');
function harness(fetchImpl, enabled=true) {
  class Field { constructor(){this.value='Тестовый черновик ё 🌳';this.attributes={};} setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];} focus(){this.focused=true;} }
  const field=new Field(),status=new Field(),error={textContent:''},button={disabled:false};
  let submit, reset=0, calls=0, abort;
  const form={dataset:{enabled:String(enabled)},action:'http://localhost/request.php',reportValidity:()=>true,elements:{namedItem:()=>field},addEventListener:(type,fn)=>{submit=fn;},reset:()=>{reset++;field.value='';},querySelectorAll:s=>s==='[aria-invalid]'?[field]:[error],querySelector:()=>field.attributes['aria-invalid']?field:null};
  const context={document:{querySelector:s=>({'#request-form':form,'#send-request':button,'#request-status':status}[s]),getElementById:()=>error},HTMLElement:Field,AbortController,URLSearchParams,FormData:class{*[Symbol.iterator](){yield ['message',field.value];}},fetch:(...args)=>{calls++;return fetchImpl(...args);},setTimeout:fn=>{abort=fn;return 1;},clearTimeout:()=>{}};
  vm.runInNewContext(code,context);
  return {form,field,status,error,button,get resets(){return reset;},get calls(){return calls;},get hasHandler(){return !!submit;},submit:()=>submit({preventDefault(){}}),abort:()=>abort()};
}
const response=(status,data)=>({ok:status>=200&&status<300,json:async()=>data});
test('отключённая форма не регистрирует отправку',()=>assert.equal(harness(()=>{throw Error('network');},false).hasHandler,false));
test('двойное нажатие создаёт один POST, успех только после accepted',async()=>{
  let finish;const h=harness((_url,options)=>{assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.body.get('message'),'Тестовый черновик ё 🌳');return new Promise(r=>{finish=r;});});
  const first=h.submit();await h.submit();assert.equal(h.calls,1);assert.equal(h.button.disabled,true);assert.equal(h.resets,0);
  finish(response(200,{code:'accepted',message:'Принято почтовым сервером.'}));await first;assert.equal(h.resets,1);assert.equal(h.button.disabled,true);assert.match(h.status.textContent,/Принято/);
});
for(const [status,codeName] of [[422,'validation'],[429,'rate'],[503,'transport'],[200,'unexpected']])test(`ответ ${status}/${codeName} сохраняет поля`,async()=>{
  const h=harness(async()=>response(status,{code:codeName,message:'Проверьте данные',errors:status===422?{phone:'Телефон неверен'}:{}}));await h.submit();assert.equal(h.resets,0);assert.equal(h.field.value,'Тестовый черновик ё 🌳');assert.equal(h.button.disabled,false);if(status===422){assert.equal(h.field.attributes['aria-invalid'],'true');assert.equal(h.error.textContent,'Телефон неверен');assert.equal(h.field.focused,true);}
});
test('сбой сети сохраняет текст, не повторяет запрос и не показывает успех',async()=>{const h=harness(async()=>{throw Error('network');});await h.submit();assert.equal(h.calls,1);assert.equal(h.resets,0);assert.match(h.status.textContent,/Отправка могла состояться/);assert.equal(h.button.disabled,false);});
test('клиентский таймаут прерывает ожидание без автоматического повтора',async()=>{const h=harness((_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('abort')))));const p=h.submit();h.abort();await p;assert.equal(h.calls,1);assert.equal(h.resets,0);assert.match(h.status.textContent,/Текст сохранён/);});
test('ошибка разбора ответа не очищает поля',async()=>{const h=harness(async()=>({ok:true,json:async()=>{throw Error('not JSON');}}));await h.submit();assert.equal(h.resets,0);assert.equal(h.calls,1);});
