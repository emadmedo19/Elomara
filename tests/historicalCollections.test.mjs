import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await readFile('src/services/historicalCollections.ts','utf8'),{loader:'ts',format:'esm'});
const {allocateHistoricalMonthlyPayments:allocate,historicalDueMonths,currentCollectionMonth}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('historical allocation fills oldest months and keeps a partial final month',()=>{
 assert.deepEqual(allocate('2025-01',1000,2500,'2025-04'),{allocations:[{month:'2025-01',amount:1000,status:'paid'},{month:'2025-02',amount:1000,status:'paid'},{month:'2025-03',amount:500,status:'partial'}],unallocatedCredit:0});
});
test('historical allocation conserves every cent and rejects invalid money',()=>{
 const result=allocate('2025-12',33.33,100,'2026-02');
 assert.equal(result.allocations.reduce((sum,row)=>sum+Math.round(row.amount*100),0)+Math.round(result.unallocatedCredit*100),10000);
 assert.equal(result.unallocatedCredit,0.01);
 for(const invalid of [-1,NaN,Infinity,1.005])assert.throws(()=>allocate('2025-01',1000,invalid,'2026-01'));
 assert.throws(()=>allocate('2025-13',1000,100,'2026-01'));
 assert.throws(()=>allocate('2025-01',0,100,'2026-01'));
});
test('dues include the current month and follow Cairo at the year boundary',()=>{
 assert.equal(historicalDueMonths('2025-01','2026-11'),23);
 assert.equal(historicalDueMonths('2027-01','2026-11'),0);
 assert.equal(currentCollectionMonth(new Date('2026-12-31T22:30:00Z')),'2027-01');
 assert.equal(historicalDueMonths('2025-12','2026-02'),3);
});
