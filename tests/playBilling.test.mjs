import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/services/playBilling.ts'],bundle:true,write:false,format:'cjs',platform:'browser',plugins:[{name:'billing-client-fixture',setup(b){
 b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'capacitor',namespace:'fixture'}));
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'api',namespace:'fixture'}));
 b.onResolve({filter:/lib\/neon$/},()=>({path:'backend',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='capacitor'?`export const Capacitor={getPlatform:()=>globalThis.fixture.platform,isPluginAvailable:()=>globalThis.fixture.plugin};export const registerPlugin=()=>({});`:path==='api'?`export const supabase={functions:{invoke:async(name,options)=>{globalThis.fixture.requests.push({name,options});return globalThis.fixture.result}}};`:`export const isNeonBackend=globalThis.fixture.neon;`}));
}}]});
function setup(options={}){const fixture={platform:'android',plugin:true,neon:true,requests:[],result:{data:{available:true},error:null},...options};const context={fixture,Response,Error,module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,context);return{fixture,...context.module.exports};}
test('old APKs, unsupported platform and backend explain why purchase controls cannot appear',()=>{for(const options of [{plugin:false},{neon:false},{platform:'web'}]){const f=setup(options);assert.equal(f.hasPlayBilling(),false);assert.match(f.playBillingUnavailableMessage(),/Google Play/);assert.equal(f.fixture.requests.length,0);}const f=setup();assert.equal(f.hasPlayBilling(),true);assert.equal(f.playBillingUnavailableMessage(),null);});
test('membership and session failures have actionable Arabic messages',async()=>{for(const[status,expected]of[[403,/مدير العمارة/],[401,/تسجيل الدخول/],[503,/إعادة تحميل الباقات/]]){const f=setup({result:{data:null,error:{context:new Response(null,{status}),message:'private provider detail'}}});await assert.rejects(f.billingRequest('building','context'),expected);}});
test('context requests remain scoped to the selected building without sending prices or granting access',async()=>{const f=setup();const context=await f.billingRequest('building','context');assert.equal(context.available,true);const call=f.fixture.requests[0];assert.equal(call.name,'play-billing');assert.deepEqual(JSON.parse(JSON.stringify(call.options.body)),{buildingId:'building',action:'context'});});
