import type {Building,Payment} from '../types';
export function HistoricalOpeningSummary({building,payments,included=false}:{building:Building;payments:Payment[];included?:boolean}) {
 const monthly=payments.filter(p=>p.isHistorical&&!p.isAssessment&&p.paymentType!=='exceptional').reduce((sum,p)=>sum+Math.round(Number(p.amount||0)*100),0)/100;
 const exceptional=Number(building.historicalExceptionalCollectionsTotal||0),expenses=Number(building.historicalExpensesTotal||0);
 if(!monthly&&!exceptional&&!expenses)return null;
 return <section data-historical-opening className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" aria-label="الأرصدة الافتتاحية السابقة">
  <h2 className="mb-2 text-sm font-bold text-slate-900">{included?'تفصيل الحسابات القديمة المشمولة في الكشف':'الأرصدة الافتتاحية السابقة (خارج حركة الفترة المختارة)'}</h2>
  <div className="flex flex-wrap gap-x-6 gap-y-2"><span>التحصيلات الشهرية السابقة الموزعة: <strong>{monthly.toLocaleString()} ج.م</strong></span><span>التحصيلات الاستثنائية السابقة: <strong>{exceptional.toLocaleString()} ج.م</strong></span><span>المصروفات السابقة: <strong>{expenses.toLocaleString()} ج.م</strong></span><span>صافي التسوية الافتتاحية: <strong>{(monthly+exceptional-expenses).toLocaleString()} ج.م</strong></span></div>
 </section>;
}
