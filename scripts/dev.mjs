import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const port=process.env.PORT || '4173';
const args=['-S',`0.0.0.0:${port}`,'-t',resolve('dist/public_html')];
if(process.env.STROY_QA==='1')args.push(resolve('scripts/dev-router.php'));
const child=spawn(process.env.PHP_BIN || 'php',args,{stdio:'inherit'});
child.on('error',()=>{console.error('Для локального просмотра нужен PHP 8.2+; задайте PHP_BIN.');process.exit(1);});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
