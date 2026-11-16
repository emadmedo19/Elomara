import React,{useEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {Printer} from '@capgo/capacitor-printer';
import {useAuth} from '../context/AuthContext';
import {loadPaymentReceipt,shareReceiptImage,type PaymentReceipt} from '../services/paymentReceipts';
import {saveAnnouncementImage} from '../services/saveAnnouncement';
import {buildStatementPrintHtml} from '../services/statementPrinting';
export function PaymentReceiptCenter(){
 const {user,userProfile}=useAuth();const scope=`${user?.id||''}:${userProfile?.buildingId||''}:${userProfile?.apartmentId||''}:${userProfile?.status||''}`;
 const activeScope=useRef(scope);activeScope.current=scope;
 const [view,setView]=useState<{scope:string;id:string}|null>(null);const [receipt,setReceipt]=useState<PaymentReceipt|null>(null);
 const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [action,setAction]=useState('');const [notice,setNotice]=useState('');
 const dialog=useRef<HTMLDivElement>(null);const busy=useRef(false);busy.current=!!action;
 const paper=useRef<HTMLDivElement>(null);const generation=useRef(0);
 useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<{paymentId?:string}>).detail?.paymentId;if(!id||!user||userProfile?.status!=='active')return;setReceipt(null);setError('');setNotice('');setAction('');setView({scope,id});};window.addEventListener('elomara-open-receipt',open);return()=>window.removeEventListener('elomara-open-receipt',open);},[scope,user,userProfile?.status]);
 useEffect(()=>{if(!view||view.scope!==scope)return;let active=true;setLoading(true);setError('');
  void loadPaymentReceipt(view.id).then(row=>{if(active&&activeScope.current===view.scope)setReceipt(row);}).catch(failure=>{if(active)setError(failure instanceof Error?failure.message:'تعذر تحميل الإيصال.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;generation.current++;};
 },[view,scope]);
 const visible=!!view&&view.scope===scope&&!!user&&userProfile?.status==='active';
 const close=()=>{if(busy.current)return;if(window.history.state?.paymentReceipt===scope)window.history.back();else setView(null);};
 useEffect(()=>{if(!visible)return;const previous=document.body.style.overflow;const focus=document.activeElement as HTMLElement|null;document.body.style.overflow='hidden';
  if(window.history.state?.paymentReceipt!==scope)window.history.pushState({...window.history.state,paymentReceipt:scope},'',window.location.href);
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const back=(event:PopStateEvent)=>{event.stopImmediatePropagation();if(!busy.current)setView(null);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopImmediatePropagation();if(!busy.current){if(window.history.state?.paymentReceipt===scope)window.history.back();else setView(null);}}
   if(event.key==='Tab'){const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };
  window.addEventListener('keydown',key,true);window.addEventListener('popstate',back,true);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key,true);window.removeEventListener('popstate',back,true);if(window.history.state?.paymentReceipt===scope)window.history.replaceState({...window.history.state,paymentReceipt:null},'',window.location.href);if(focus?.isConnected)focus.focus();};
 },[visible,scope]);
 const exportReceipt=async(kind:'pdf'|'image'|'whatsapp')=>{
  if(!view||!receipt||action)return;const expectedScope=scope;const version=generation.current;setAction(kind);setError('');setNotice('');
  try{
   const current=await loadPaymentReceipt(view.id);if(activeScope.current!==expectedScope||generation.current!==version)return;
   flushSync(()=>setReceipt(current));if(document.fonts?.ready)await document.fonts.ready;
   if(activeScope.current!==expectedScope||!paper.current)return;
   const filename='elomara-receipt-'+current.id.replace(/[^a-zA-Z0-9_-]/g,'')+'.png';
   if(kind==='pdf'){const html=await buildStatementPrintHtml(paper.current,'إيصال سداد شقة '+current.unitNumber);if(activeScope.current!==expectedScope)return;await Printer.printHtml({name:'إيصال سداد شقة '+current.unitNumber,html});}
   else {const {default:html2canvas}=await import('html2canvas');const canvas=await html2canvas(paper.current,{scale:2,backgroundColor:'#ffffff',logging:false});if(activeScope.current!==expectedScope)return;const data=canvas.toDataURL('image/png');
    if(kind==='whatsapp'){await shareReceiptImage(data,filename);setNotice('تم فتح المشاركة؛ اختار المستلم وأكد الإرسال.');}
    else{const result=await saveAnnouncementImage(data,filename);setNotice(result==='cancelled'?'تم إلغاء الحفظ.':result==='saved'?'تم حفظ صورة الإيصال.':'بدأ تحميل صورة الإيصال.');}
   }
  }catch(failure){if(activeScope.current===expectedScope&&!(failure instanceof DOMException&&failure.name==='AbortError'))setError(failure instanceof Error?failure.message:'تعذر تجهيز الإيصال.');}
  finally{if(activeScope.current===expectedScope)setAction('');}
 };
 if(!visible)return null;
 const rowStyle:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #e2e8f0',fontSize:14,color:'#0f2537'};
 return createPortal(<div ref={dialog} data-payment-receipt className="fixed inset-0 z-[150] overflow-y-auto bg-slate-900/75 p-3" dir="rtl" role="dialog" aria-modal="true" aria-label="إيصال سداد الشقة">
  <div className="mx-auto my-3 w-full max-w-xl rounded-2xl bg-white p-4 text-slate-800">
   <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-bold">إيصال سداد الشقة</h2><button type="button" disabled={!!action} onClick={close} className="min-h-11 px-3">إغلاق الإيصال</button></div>
   {loading?<p role="status">جارٍ تجهيز إيصال السداد...</p>:receipt?<>
   <div ref={paper} data-receipt-paper style={{backgroundColor:'#ffffff',color:'#0f2537',fontFamily:'Arial,sans-serif',direction:'rtl',padding:22,border:'2px solid #0f766e',borderRadius:16,width:'100%',boxSizing:'border-box'}}>
    <div style={{textAlign:'center',borderBottom:'2px solid #0f766e',paddingBottom:14,color:'#0f2537'}}><h1 style={{fontSize:23,fontWeight:700,margin:'0 0 8px',color:'#0f766e'}}>إيصال سداد</h1><h2 style={{fontSize:18,fontWeight:700,margin:0,color:'#0f2537'}}>{receipt.buildingName}</h2>{receipt.buildingAddress&&<p style={{fontSize:12,color:'#475569',marginTop:5}}>{receipt.buildingAddress}</p>}</div>
    <div style={rowStyle}><span>رقم الإيصال</span><strong style={{overflowWrap:'anywhere',maxWidth:'68%'}}>{receipt.receiptNumber}</strong></div>
    <div style={rowStyle}><span>الشقة / الوحدة</span><strong>شقة {receipt.unitNumber}</strong></div>
    <div style={rowStyle}><span>اسم الساكن / الشاغل</span><strong>{receipt.residentName||'غير مسجل'}</strong></div>
    <div style={rowStyle}><span>نوع السداد</span><strong>{receipt.paymentType==='exceptional'?'تحصيل استثنائي':'اشتراك شهري'}</strong></div>
    <div style={rowStyle}><span>البند</span><strong style={{maxWidth:'68%',overflowWrap:'anywhere'}}>{receipt.description}</strong></div>
    <div style={rowStyle}><span>الدورة / الشهر</span><strong>{receipt.period}</strong></div>
    <div style={rowStyle}><span>تاريخ السداد</span><strong>{receipt.paymentDate}</strong></div>
    <div style={rowStyle}><span>طريقة السداد</span><strong>{receipt.method}</strong></div>
    <div style={{marginTop:18,padding:16,textAlign:'center',backgroundColor:'#f0fdfa',border:'1px solid #99f6e4',borderRadius:12,color:'#115e59'}}><span style={{display:'block',fontSize:13,color:'#115e59'}}>المبلغ المسدد</span><strong style={{fontSize:27,color:'#0f766e'}}>{Number(receipt.amount).toLocaleString('ar-EG',{maximumFractionDigits:2})} جنيه</strong></div>
    {receipt.notes&&<p style={{fontSize:13,marginTop:14,color:'#475569',overflowWrap:'anywhere'}}>ملاحظات: {receipt.notes}</p>}
    <p style={{fontSize:10,marginTop:18,color:'#64748b',overflowWrap:'anywhere'}}>مرجع العملية: {receipt.reference}</p>
    <p style={{fontSize:11,marginTop:8,color:'#64748b'}}>إيصال صادر من سجل السداد الإلكتروني للعمارة.</p>
   </div>
   <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" disabled={!!action} onClick={()=>void exportReceipt('pdf')} className="min-h-12 rounded-xl bg-teal-700 p-3 text-sm font-bold text-white disabled:opacity-50">طباعة / حفظ PDF</button><button type="button" disabled={!!action} onClick={()=>void exportReceipt('image')} className="min-h-12 rounded-xl border border-teal-200 p-3 text-sm font-bold text-teal-800 disabled:opacity-50">حفظ صورة الإيصال</button><button type="button" disabled={!!action} onClick={()=>void exportReceipt('whatsapp')} className="min-h-12 rounded-xl bg-green-700 p-3 text-sm font-bold text-white disabled:opacity-50">مشاركة على واتساب</button></div>
   {action&&<p role="status" className="mt-3 text-sm">جارٍ تجهيز الإيصال...</p>}
   </>:null}
   {error&&<div role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}{!receipt&&<button type="button" className="min-h-11 px-3 underline" onClick={()=>view&&setView({...view})}>إعادة المحاولة</button>}</div>}
   {notice&&<p role="status" className="mt-3 text-sm text-teal-800">{notice}</p>}
  </div>
 </div>,document.body);
}
