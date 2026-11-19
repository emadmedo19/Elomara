import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchQueuedPushes } from '../functions/push-kick.mjs';
const req=token=>new Request('https://backend.invalid/functions/v1/kick-mobile-delivery',{
  method:'POST',headers:token?{Authorization:token}:{}
});
test('anonymous callers are rejected before touching the queue',async()=>{
  let calls=0;
  const r=await dispatchQueuedPushes(req(),async()=>{calls++;return 200;},async()=>{calls++;return Response.json({claimed:0});});
  assert.equal(r.status,401);assert.equal(calls,0);
});
test('approved callers drain a bounded number of batches without revealing counts',async()=>{
  const batches=[40,40,2];
  const r=await dispatchQueuedPushes(req('Bearer fake'),async()=>200,async()=>Response.json({claimed:batches.shift(),sent:1,failed:0}));
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{accepted:true});assert.equal(batches.length,0);
});
test('suspended users and failed delivery are rejected safely',async()=>{
  let calls=0;
  const denied=await dispatchQueuedPushes(req('Bearer bad'),async()=>403,async()=>{calls++;return Response.json({claimed:1});});
  assert.equal(denied.status,403);assert.equal(calls,0);
  const failed=await dispatchQueuedPushes(req('Bearer good'),async()=>200,async()=>new Response(null,{status:503}));
  assert.equal(failed.status,503);
});
