import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CollectionsView } from '../../src/components/CollectionsView';
import { useBodyScrollLock } from '../../src/hooks/useBodyScrollLock';
import type { Apartment, Building, Payment } from '../../src/types';
const building: Building = {id:'fixture',name:'اختبار النوافذ',address:'',totalUnits:14,balance:0,monthlyTarget:14000,reserveFund:0,managerName:'',managerPhone:''};
const apartments: Apartment[] = Array.from({length:14},(_,i)=>({id:String(i+1),buildingId:'fixture',unitNumber:String(i+1),floor:1,residentName:'ساكن تجريبي',residentPhone:'',isOwner:true,monthlyFee:1000,status:'pending',overdueMonths:1}));
function Lock({active}:{active:boolean}){useBodyScrollLock(active);return null;}
function Fixture(){
 const [visible,setVisible]=useState(true);const [payments,setPayments]=useState<Payment[]>([]);
 const [first,setFirst]=useState(false),[second,setSecond]=useState(false);
 return <><nav><button onClick={()=>setVisible(v=>!v)}>تبديل الشاشة</button><button onClick={()=>{setFirst(true);setSecond(true);}}>فتح قفلين</button><button onClick={()=>setFirst(false)}>إغلاق الأول</button><button onClick={()=>setSecond(false)}>إغلاق الثاني</button></nav><Lock active={first}/><Lock active={second}/>{visible&&<CollectionsView currentBuilding={building} apartments={apartments} payments={payments} role={new URLSearchParams(location.search).get('role')==='owner'?'owner':'manager'} onAddApartment={()=>{}} onUpdateApartment={()=>{}} onDeleteApartment={()=>{}} onSavePayment={async data=>{setPayments(p=>[...p,{...data,id:'saved',buildingId:'fixture',unitNumber:data.apartmentId,residentName:'ساكن تجريبي',recordedAt:new Date().toISOString()}]);return true;}} onEditPayment={async()=>true} onDeletePayment={()=>{}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
