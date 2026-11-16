export interface BuildingFinancialSnapshot {
 balance:number;
 openingBalance:number|null;
 reserveFund:number;
 historicalAdjustment:number;
 historicalMonthly:number;
 expenses:number;
 exceptional:number;
 startMonth:string|null;
}
export interface BuildingFinanceDraft {
 baseOpening:number;
 reserve:number;
 startMonth:string|null;
 expenses:number;
 exceptional:number;
 expected:BuildingFinancialSnapshot|null;
 openingAlreadyIncluded:boolean|null;
}
export function mapBuildingFinancialSnapshot(row:Record<string,unknown>):BuildingFinancialSnapshot {
 const snapshot:BuildingFinancialSnapshot={balance:Number(row.balance),openingBalance:row.opening_balance==null?null:Number(row.opening_balance),reserveFund:Number(row.reserve_fund||0),
  historicalAdjustment:Number(row.historical_adjustment_applied||0),historicalMonthly:Number(row.historical_monthly_collections_total||0),expenses:Number(row.historical_expenses_total||0),
  exceptional:Number(row.historical_exceptional_collections_total||0),startMonth:row.collection_start_month?String(row.collection_start_month).slice(0,7):null};
 if(Object.values(snapshot).some(value=>typeof value==='number'&&!Number.isFinite(value)))throw new Error('تعذر تأكيد أرصدة العمارة. أعد تحميل الأرصدة.');
 return snapshot;
}
export function baseOpeningBalance(snapshot:BuildingFinancialSnapshot):number|null {
 return snapshot.openingBalance===null?null:Math.round((snapshot.openingBalance-snapshot.historicalAdjustment)*100)/100;
}
export function previewBuildingBalance(snapshot:BuildingFinancialSnapshot,draft:Pick<BuildingFinanceDraft,'baseOpening'|'expenses'|'exceptional'|'openingAlreadyIncluded'>):number|null {
 const previousBase=baseOpeningBalance(snapshot);
 if(previousBase===null&&draft.openingAlreadyIncluded===null)return null;
 const baseDelta=previousBase===null?(draft.openingAlreadyIncluded?0:draft.baseOpening):draft.baseOpening-previousBase;
 const historicalNet=snapshot.historicalMonthly+draft.exceptional-draft.expenses;
 return Math.round((snapshot.balance+baseDelta+historicalNet-snapshot.historicalAdjustment)*100)/100;
}
