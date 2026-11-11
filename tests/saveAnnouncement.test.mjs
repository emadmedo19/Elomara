import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/services/saveAnnouncement.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'native-save-fixture',setup(b){b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'cap',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const Capacitor=globalThis.fixture.Capacitor;export const registerPlugin=()=>globalThis.fixture.plugin;'}))}}]});
const png='data:image/png;base64,iVBORw0KGgo=';
function setup({native=true,available=true,saved=true,fails=false}={}){
 const calls=[];const fixture={Capacitor:{isNativePlatform:()=>native,isPluginAvailable:()=>available},plugin:{savePng:async opts=>{calls.push(opts);if(fails)throw Error('storage full');return{saved}}}};
 const link={click(){calls.push('download')},remove(){calls.push('remove')}};
 const ctx={fixture,module:{exports:{}},document:{createElement:()=>link,body:{appendChild(){}}}};
 vm.runInNewContext(compiled.outputFiles[0].text,ctx);return{save:ctx.module.exports.saveAnnouncementImage,calls,link};
}
test('Android asks native storage to save the combined PNG and only then reports success',async()=>{
 const {save,calls}=setup();assert.equal(await save(png),'saved');assert.equal(calls[0].dataUrl,png);assert.match(calls[0].fileName,/^elomara-announcement-\d+\.png$/);
});
test('cancelled system picker is not reported as a save',async()=>{assert.equal(await setup({saved:false}).save(png),'cancelled')});
test('write failure is surfaced and an older APK gets an actionable upgrade message',async()=>{
 await assert.rejects(setup({fails:true}).save(png),/storage full/);await assert.rejects(setup({available:false}).save(png),/APK/);
});
test('web keeps the browser download flow and removes its temporary link',async()=>{
 const {save,calls,link}=setup({native:false});assert.equal(await save(png),'download-started');assert.equal(link.href,png);assert.deepEqual(calls,['download','remove']);
});
test('missing image never opens a native save dialog',async()=>{const {save,calls}=setup();await assert.rejects(save('bad'),/غير جاهزة/);assert.equal(calls.length,0)});
