import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
let count=0,failed=false;
async function check(code,label,module=true){const result=spawnSync(process.execPath,[...(module?['--input-type=module']:[]),'--check'],{input:code,encoding:'utf8'});if(result.status){failed=true;console.error(label,result.stderr);}count++;}
for(const file of await readdir('.')){if(!file.endsWith('.html'))continue;const html=await readFile(file,'utf8');for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(!match[1].includes('src=')&&match[2].trim())await check(match[2],file,match[1].includes('module'));}}
for(const file of await readdir('js'))if(/\.(m?js)$/.test(file))await check(await readFile('js/'+file,'utf8'),'js/'+file);
console.log(`${failed?'FAIL':'PASS'}: ${count} JavaScript scripts parsed.`);process.exitCode=failed?1:0;
