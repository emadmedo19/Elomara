import type {Building,Payment,Expense} from '../types';
export type ReportSelection={scope:'all'|'period';startDate:string;endDate:string;buildingId:string};
const sum=(rows:{amount:number}[])=>rows.reduce((n,row)=>n+Math.round(Number(row.amount||0)*100),0)/100;
export function calculateReport(building:Building,payments:Payment[],expenses:Expense[],selection:ReportSelection){
 const rows=payments.filter(p=>!p.buildingId||p.buildingId===building.id);
 const costs=expenses.filter(e=>!e.buildingId||e.buildingId===building.id);
 const actual=rows.filter(p=>!p.isAssessment&&!p.isHistorical);
 const all=selection.scope==='all';
 const inRange=(date:string)=>date.slice(0,10)>=selection.startDate&&date.slice(0,10)<=selection.endDate;
 const selectedPayments=rows.filter(p=>!p.isAssessment&&(all||(!p.isHistorical&&inRange(p.date))));
 const selectedExpenses=costs.filter(e=>all||inRange(e.date));
 const actualSelected=actual.filter(p=>all||inRange(p.date));
 const historicalMonthly=sum(rows.filter(p=>!p.isAssessment&&p.isHistorical&&p.paymentType!=='exceptional'));
 const historicalExceptional=Number(building.historicalExceptionalCollectionsTotal||0);
 const historicalExpenses=Number(building.historicalExpensesTotal||0);
 const totalInflow=Math.round((sum(actualSelected)+(all?historicalMonthly+historicalExceptional:0))*100)/100;
 const totalOutflow=Math.round((sum(selectedExpenses)+(all?historicalExpenses:0))*100)/100;
 const cashAtStart=Math.round((building.balance-sum(actual)+sum(costs))*100)/100;
 const openingBalance=all?cashAtStart:Math.round((cashAtStart+sum(actual.filter(p=>p.date.slice(0,10)<selection.startDate))-sum(costs.filter(e=>e.date.slice(0,10)<selection.startDate)))*100)/100;
 const cashMovement=Math.round((sum(actualSelected)-sum(selectedExpenses))*100)/100;
 const closingBalance=Math.round((openingBalance+cashMovement)*100)/100;
 const unassignedExceptional=Math.max(0,Math.round((historicalExceptional-sum(rows.filter(p=>p.isHistorical&&!p.isAssessment&&p.paymentType==='exceptional')))*100)/100);
 return {all,rows,selectedPayments,selectedExpenses,historicalMonthly,historicalExceptional,historicalExpenses,totalInflow,totalOutflow,netSurplus:Math.round((totalInflow-totalOutflow)*100)/100,openingBalance,cashMovement,closingBalance,unassignedExceptional};
}
