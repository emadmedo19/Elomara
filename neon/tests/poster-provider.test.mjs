import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../functions/handlers/generate-announcement-image.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'fixture-db',setup(b){b.onResolve({filter:/database\.mjs$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const createBackendClient=()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic-manager'}},error:null})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:globalThis.fixture.profile,error:null})})});`}))}}]});
function setup(env={}){
 const calls=[];const fixture={profile:{role:'building_admin',approved:true,disabled_at:null,building_id:'synthetic'}};
 const ctx={fixture,module:{exports:{}},process:{env},Request,Response,AbortSignal,Uint8Array,btoa,console:{error(){},warn(){}},fetch:async(url,options)=>{calls.push({url,options});return url.includes('googleapis')?Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429}):Response.json({data:[{b64_json:'a'.repeat(120)}]});}};
 vm.runInNewContext(bundle.outputFiles[0].text,ctx);
 return{handler:ctx.module.exports.default,calls,fixture};
}
const request=(prompt='تنبيه للسكان بموعد صيانة المصعد')=>new Request('https://backend.invalid/functions/v1/generate-announcement-image',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({prompt,aspectRatio:'16:9'})});
test('Gemini quota failure falls back to the configured alternative and preserves dimensions',async()=>{
 const {handler,calls}=setup({GEMINI_API_KEY:'fixture',POLLINATIONS_API_KEY:'fixture-alternative',POLLINATIONS_FREE_ONLY:'true'});
 const r=await handler(request());const data=await r.json();assert.equal(r.status,200);assert.equal(data.provider,'pollinations');assert.match(data.image,/^data:image\/png;base64,/);
 assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].options.body).size,'1280x720');
});
test('unconfigured alternative gives an actionable quota error without issuing an alternative request',async()=>{
 const {handler,calls}=setup({GEMINI_API_KEY:'fixture'});const r=await handler(request());assert.equal(r.status,429);assert.match((await r.json()).error,/المزوّد البديل لم يُفعّل/);assert.equal(calls.length,1);
});
test('alternative remains disabled without explicit operator opt-in',async()=>{
 const {handler,calls}=setup({GEMINI_API_KEY:'fixture',POLLINATIONS_API_KEY:'fixture'});await handler(request());assert.equal(calls.length,1);
});
test('resident requests cannot consume image quota',async()=>{
 const {handler,calls,fixture}=setup({GEMINI_API_KEY:'fixture'});fixture.profile.role='tenant';assert.equal((await handler(request())).status,403);assert.equal(calls.length,0);
});

test('subscription notice keeps its payment artwork even when mentioning cleaning services',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request('يرجى سداد اشتراك الشهر لدعم الصيانة والنظافة والحراسة'));
 assert.match(JSON.parse(calls[0].options.body).prompt,/payment and service motifs/);
});
test('maintenance artwork requests active technicians and keeps space for overlaid text',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request('تنبيه للسكان بموعد صيانة المصعد'));
 const prompt=JSON.parse(calls[0].options.body).prompt;
 assert.match(prompt,/technicians actively inspecting and servicing/);
 assert.match(prompt,/LEFT 40%/);
 assert.match(prompt,/overlays accurate dark teal Arabic text directly/);
});

for (const [notice, expected] of [
 ['دعوة لاجتماع السكان والملاك لمناقشة صيانة المصعد والكهرباء', /community meeting/],
 ['يرجى سداد الاشتراك لدعم صيانة المصعد ونظافة العمارة', /payment and service motifs/],
 ['يرجى مراعاة الهدوء وتجنب أعمال الصيانة المزعجة', /serene atmosphere/],
 ['يرجى الالتزام بأماكن السيارات داخل الجراج', /organized residential garage/],
 ['تهنئة للسكان بمناسبة شهر رمضان الكريم', /MAIN subject and purpose/],
]) test('non-maintenance notice follows its purpose: '+notice,async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request(notice));
 const prompt=JSON.parse(calls[0].options.body).prompt;
 assert.match(prompt,expected);
 assert.match(prompt,/everyday civilian clothing/);
 assert.doesNotMatch(prompt,/teal workwear|Show the specified work in progress|technicians actively/);
});

test('approved direction uses friendly 3D cartoon characters with a light text area',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request());const prompt=JSON.parse(calls[0].options.body).prompt;
 assert.match(prompt,/FRIENDLY 3D CARTOON ILLUSTRATION/);assert.match(prompt,/clearly stylized cartoon adults/);assert.match(prompt,/light cream negative space/);
});
