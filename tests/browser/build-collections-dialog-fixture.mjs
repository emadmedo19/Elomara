import {build} from 'esbuild';
import {mkdirSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
const out=process.argv[2]||'/tmp/elomara-dialog-fixture';
mkdirSync(out,{recursive:true});
await build({entryPoints:['tests/browser/collections-dialog-fixture.tsx'],bundle:true,format:'esm',outfile:out+'/fixture.js'});
const css=readdirSync('dist/assets').find(n=>n.startsWith('index-')&&n.endsWith('.css'));
copyFileSync('dist/assets/'+css,out+'/fixture.css');
writeFileSync(out+'/index.html','<!doctype html><html dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0}nav{position:relative;z-index:1}button{min-height:36px}svg{width:20px;height:20px}</style><div id="root"></div><script type="module" src="fixture.js"></script></html>');
