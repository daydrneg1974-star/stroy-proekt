import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const php = process.env.PHP_BIN || 'php';
for (const file of ['request.php', 'scripts/dev-router.php', ...readdirSync('server').filter(n=>n.endsWith('.php')).map(n=>`server/${n}`), 'tests/php/run.php']) {
  const result=spawnSync(php,['-l',file],{stdio:'inherit'});
  if(result.error){console.error('Нужен PHP 8.2+ с mbstring и openssl; задайте PHP_BIN.');process.exit(1);}
  if(result.status!==0)process.exit(1);
}
const result=spawnSync(php,['tests/php/run.php'],{stdio:'inherit'});
process.exit(result.status??1);
