import {test} from 'node:test';import assert from 'node:assert/strict';import {transform} from 'esbuild';import {readFile} from 'node:fs/promises';
const {code}=await transform(await readFile('src/services/reportAccounting.ts','utf8'),{loader:'ts',format:'esm'});
const {calculateReport:report}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const building={id:'one',balance:10486,historicalExceptionalCollectionsTotal:67100,historicalExpensesTotal:76269};
const payments=[{id:'old-monthly',buildingId:'one',apartmentId:'a',date:'2025-01-01',amount:15400,isHistorical:true,paymentType:'monthly'},{id:'old-exceptional',buildingId:'one',apartmentId:'a',date:'2025-01-01',amount:67100,isHistorical:true,paymentType:'exceptional'},{id:'assessment',buildingId:'one',amount:84000,isAssessment:true,date:'2025-01-01'}];
const selection={scope:'all',startDate:'2025-01-01',endDate:'2026-11-16',buildingId:'one'};
test('reported old balances appear once in complete totals and never add to observed cash',()=>{
 const r=report(building,payments,[],selection);assert.equal(r.totalInflow,82500);assert.equal(r.totalOutflow,76269);assert.equal(r.netSurplus,6231);assert.equal(r.openingBalance,10486);assert.equal(r.closingBalance,10486);assert.equal(r.cashMovement,0);assert.equal(r.selectedPayments.length,2);assert.equal(r.unassignedExceptional,0);
});
test('period reports exclude historical entries even when dates overlap',()=>{
 const r=report(building,payments,[],{...selection,scope:'period'});assert.equal(r.totalInflow,0);assert.equal(r.totalOutflow,0);assert.equal(r.closingBalance,10486);assert.equal(r.selectedPayments.length,0);
});
test('new receipts/expenses and fractional amounts update complete totals and cash independently',()=>{
 const p=[...payments,{id:'new',buildingId:'one',date:'2026-11-01',amount:123.45}];const e=[{id:'expense',buildingId:'one',date:'2026-11-01',amount:23.45}];const b={...building,balance:10586};
 const all=report(b,p,e,selection);assert.equal(all.totalInflow,82623.45);assert.equal(all.totalOutflow,76292.45);assert.equal(all.closingBalance,10586);assert.equal(all.openingBalance,10486);
 const period=report(b,p,e,{...selection,scope:'period',startDate:'2026-11-01'});assert.equal(period.totalInflow,123.45);assert.equal(period.totalOutflow,23.45);assert.equal(period.netSurplus,100);assert.equal(period.closingBalance,10586);
 const before=report(b,p,e,{...selection,scope:'period',endDate:'2026-10-31'});assert.equal(before.closingBalance,10486);
});
test('unassigned exceptional history is disclosed and unrelated buildings never enter the report',()=>{
 const r=report(building,[payments[0],{buildingId:'other',date:'2025-01-01',amount:99999,isHistorical:true}], [{buildingId:'other',date:'2025-01-01',amount:555}],selection);assert.equal(r.totalInflow,82500);assert.equal(r.totalOutflow,76269);assert.equal(r.unassignedExceptional,67100);
});
