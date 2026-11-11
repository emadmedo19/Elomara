import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../functions/handlers/generate-announcement-image.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'fixture-db',setup(b){b.onResolve({filter:/database\.mjs$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const createBackendClient=()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic-manager'}},error:null})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:globalThis.fixture.profile,error:null})})});`}))}}]});
function setup(env={}){
 const calls=[];const fixture={inspection:{hasText:false,confidence:.99,wall:{x:.42,y:.08,width:.55,height:.85}},profile:{role:'building_admin',approved:true,disabled_at:null,building_id:'synthetic'}};
 const ctx={fixture,module:{exports:{}},process:{env:{GEMINI_API_KEY:'fixture',...env}},Request,Response,AbortSignal,Uint8Array,btoa,console:{error(){},warn(){}},fetch:async(url,options)=>{calls.push({url,options});if(url.includes('gemini-3.1-flash-lite'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(JSON.parse(options.body).contents[0].parts.length===1?{scene:'MAIN subject and purpose: a festive residential celebration'}:fixture.inspection)}]}}]});return url.includes('googleapis')?Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429}):Response.json({data:[{b64_json:'a'.repeat(120)}]});}};
 vm.runInNewContext(bundle.outputFiles[0].text,ctx);
 return{handler:ctx.module.exports.default,calls,fixture};
}
const request=(prompt='تنبيه للسكان بموعد صيانة المصعد')=>new Request('https://backend.invalid/functions/v1/generate-announcement-image',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({prompt,aspectRatio:'16:9'})});
test('Gemini quota failure falls back to the configured alternative and preserves dimensions',async()=>{
 const {handler,calls}=setup({GEMINI_API_KEY:'fixture',POLLINATIONS_API_KEY:'fixture-alternative',POLLINATIONS_FREE_ONLY:'true'});
 const r=await handler(request());const data=await r.json();assert.equal(r.status,200);assert.equal(data.provider,'pollinations');assert.match(data.image,/^data:image\/png;base64,/);
 assert.equal(calls.length,3);assert.equal(JSON.parse(calls[1].options.body).size,'1280x720');
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
 assert.match(JSON.parse(calls.find(c=>c.url.includes("pollinations")).options.body).prompt,/payment and service motifs/);
});
test('maintenance artwork requests active technicians and keeps space for overlaid text',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request('تنبيه للسكان بموعد صيانة المصعد'));
 const prompt=JSON.parse(calls.find(c=>c.url.includes("pollinations")).options.body).prompt;
 assert.match(prompt,/technicians actively inspecting and servicing/);
 assert.match(prompt,/LEFT 40%/);
 assert.match(prompt,/paint accurate Arabic lettering directly on this wall/);
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
 const prompt=JSON.parse(calls.find(c=>c.url.includes("pollinations")).options.body).prompt;
 assert.match(prompt,expected);
 assert.match(prompt,/everyday civilian clothing/);
 assert.doesNotMatch(prompt,/teal workwear|Show the specified work in progress|technicians actively/);
});

test('approved direction uses friendly 3D cartoon characters with an architectural wall for text',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request());const prompt=JSON.parse(calls.find(c=>c.url.includes("pollinations")).options.body).prompt;
 assert.match(prompt,/FRIENDLY 3D CARTOON ILLUSTRATION/);assert.match(prompt,/clearly stylized cartoon adults/);assert.match(prompt,/ACTUAL architectural wall inside the scene/);
});

test('text belongs to a front-facing wall inside the scene without a floating panel or white haze',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request());const prompt=JSON.parse(calls.find(c=>c.url.includes("pollinations")).options.body).prompt;
 assert.match(prompt,/naturally connected to the floor, ceiling, doorway or elevator door/);
 assert.match(prompt,/front-facing with no perspective skew/);
 assert.match(prompt,/Do NOT render a floating card/);
});
for (const [name, inspection] of [
 ['garbled generated text',{hasText:true,confidence:.99,wall:{x:.1,y:.1,width:.8,height:.6}}],
 ['missing wall',{hasText:false,confidence:.99,wall:null}],
 ['unsafe wall coordinates',{hasText:false,confidence:.99,wall:{x:.8,y:.1,width:.6,height:.7}}],
 ['uncertain wall',{hasText:false,confidence:.3,wall:{x:.1,y:.1,width:.8,height:.6}}],
]) test('refuses '+name+' instead of painting on the characters',async()=>{
 const {handler,fixture}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 fixture.inspection=inspection;const r=await handler(request());const result=await r.json();
 assert.equal(r.status,422);assert.equal(result.image,undefined);assert.equal(typeof result.error,'string');
});
test('image generator receives an English visual description without the Arabic notice text',async()=>{
 const {handler,calls}=setup({POLLINATIONS_API_KEY:'fixture',POLLINATIONS_FREE_ONLY:'true'});
 await handler(request('تنبيه للسكان بموعد صيانة المصعد يوم الجمعة'));
 const visual=JSON.parse(calls.find(c=>c.url.includes('pollinations')).options.body).prompt;
 assert.doesNotMatch(visual,/[\u0600-\u06ff]/);
});
