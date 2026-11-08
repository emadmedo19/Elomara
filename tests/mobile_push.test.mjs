import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
const source=await readFile('supabase/functions/deliver-mobile-notifications/index.ts','utf8');
const code=(await transform(source.replace(/^import .*;\n/,''),{loader:'ts',format:'esm'})).code;
const secret='test-only-secret';
const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))).toString('hex');
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
for(const scenario of ['unauthorized','success','retry']){
 let handler,claimed=0,ack=0,payload;
 const row={delivery_id:'d',lease_id:'lease',notification_id:'n',device_id:'device',token:'fake-token',title:'PRIVATE',body:'PRIVATE AMOUNT',category:'payments',building_id:'PRIVATE BUILDING'};
 const admin={from(table){const chain={select(){return chain},is(){return chain},eq(){return chain},maybeSingle:async()=>({data:{setting_value:{secret_hash:hash}}}),update(value){if(value.completed_at)ack++;return chain},then(resolve){resolve({error:null})}};return chain},rpc:async()=>{claimed++;return {data:[row]}}};
 const fetch=async(url,options)=>{if(url.includes('oauth2'))return Response.json({access_token:'fake-access'});payload=JSON.parse(options.body);return Response.json({}, {status:scenario==='retry'?503:200})};
 const context={createClient:()=>admin,Response,Request,TextEncoder,Uint8Array,URLSearchParams,AbortSignal,crypto:webcrypto,btoa,atob,fetch,Deno:{env:{get:(key)=>key==='FIREBASE_SERVICE_ACCOUNT_JSON'?JSON.stringify({project_id:'elfotoh',client_email:'fake@example.test',private_key:pem}):'fake'},serve(fn){handler=fn}}};
 vm.runInNewContext(code,context);
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:scenario==='unauthorized'?{}:{'x-cron-secret':secret}}));
 if(scenario==='unauthorized'){assert.equal(response.status,401);assert.equal(claimed,0)}else{
 assert.equal(response.status,200);assert.equal(JSON.stringify(payload).includes('PRIVATE'),false);assert.equal(ack,scenario==='success'?1:0);
 }
 console.log('PASS',scenario);
}
