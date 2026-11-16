import {Capacitor,registerPlugin} from '@capacitor/core';
import {fetchNeonPaymentReceipt} from '../lib/neon';
export type PaymentReceipt={id:string;reference:string;receiptNumber:string;buildingId:string;buildingName:string;buildingAddress:string;apartmentId:string;unitNumber:string;residentName:string;amount:number;paymentDate:string;period:string;method:string;notes:string;paymentType:string;description:string;recordedAt:string};
export function requestPaymentReceipt(paymentId:string){window.dispatchEvent(new CustomEvent('elomara-open-receipt',{detail:{paymentId}}));}
export async function loadPaymentReceipt(id:string):Promise<PaymentReceipt>{
 const r=await fetchNeonPaymentReceipt(id);
 if(r.id!==id||!Number.isFinite(Number(r.amount))||Number(r.amount)<=0||typeof r.apartmentId!=='string'||typeof r.buildingId!=='string')throw Error('تعذر تأكيد بيانات الإيصال.');
 return r as PaymentReceipt;
}
const Files=registerPlugin<{beginPngTransfer:(p:{chunks:number})=>Promise<void>;appendPngChunk:(p:{index:number;chunk:string})=>Promise<void>;finishPngShare:(p:{fileName:string;whatsapp:boolean})=>Promise<void>}>('AnnouncementFiles');
export async function shareReceiptImage(dataUrl:string,fileName:string){
 if(!/^data:image\/png;base64,/.test(dataUrl))throw Error('تعذر تجهيز صورة الإيصال.');
 if(Capacitor.isNativePlatform()){
  try{
   const data=dataUrl.slice('data:image/png;base64,'.length),size=12288,chunks=Math.ceil(data.length/size);
   if(chunks<1||chunks>512)throw Error('صورة الإيصال أكبر من الحد المتاح.');
   await Files.beginPngTransfer({chunks});for(let index=0;index<chunks;index++)await Files.appendPngChunk({index,chunk:data.slice(index*size,(index+1)*size)});
   await Files.finishPngShare({fileName,whatsapp:true});return;
  }catch(error){if(/not implemented|not available|not found/i.test(String(error)))throw Error('مشاركة الإيصال على واتساب تحتاج تثبيت أحدث نسخة أندرويد؛ يمكنك حاليًا حفظ الصورة وإرفاقها.');throw error;}
 }
 const binary=atob(dataUrl.split(',')[1]);const file=new File([Uint8Array.from(binary,c=>c.charCodeAt(0))],fileName,{type:'image/png'});
 if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'إيصال سداد'});return;}
 throw Error('المشاركة المباشرة غير متاحة على هذا الجهاز. احفظ صورة الإيصال وأرفقها في واتساب.');
}
