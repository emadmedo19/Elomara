import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
const {code}=await transform(await readFile('src/services/buildingFinancialSettings.ts','utf8'),{loader:'ts',format:'esm'});
const {mapBuildingFinancialSnapshot:map,baseOpeningBalance:base,previewBuildingBalance:preview}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const snapshot=map({balance:5850,opening_balance:5600,reserve_fund:500,historical_adjustment_applied:5500,historical_monthly_collections_total:3500,historical_expenses_total:10000,historical_exceptional_collections_total:12000,collection_start_month:'2026-01-01'});
const draft={baseOpening:100,expenses:10000,exceptional:12000,openingAlreadyIncluded:null};
test('base excludes all already-applied historical adjustments',()=>{
 assert.equal(base(snapshot),100);assert.equal(preview(snapshot,draft),5850);
 assert.equal(preview(snapshot,{...draft,baseOpening:600}),6350);
 assert.equal(preview(snapshot,{...draft,reserve:9000}),5850);
});
test('new monthly allocations change cash but do not change the saved base',()=>{
 const next={...snapshot,balance:6350,openingBalance:6100,historicalAdjustment:6000,historicalMonthly:4000};
 assert.equal(base(next),100);assert.equal(preview(next,draft),6350);
});
test('legacy opening requires an inclusion choice and never doubles included cash',()=>{
 const legacy={...snapshot,balance:5000,openingBalance:null,historicalAdjustment:0,historicalMonthly:0,expenses:0,exceptional:0};
 const values={baseOpening:5000,expenses:0,exceptional:0,openingAlreadyIncluded:null};
 assert.equal(preview(legacy,values),null);
 assert.equal(preview(legacy,{...values,openingAlreadyIncluded:true}),5000);
 assert.equal(preview(legacy,{...values,openingAlreadyIncluded:false}),10000);
});
test('opening deficit is visible and bad snapshot numbers are rejected',()=>{
 const reset={...snapshot,balance:0,openingBalance:0,historicalAdjustment:0,historicalMonthly:0,expenses:0,exceptional:0};
 assert.equal(preview(reset,{baseOpening:0,expenses:10000,exceptional:8000,openingAlreadyIncluded:null}),-2000);
 assert.throws(()=>map({balance:'bad'}));
});
