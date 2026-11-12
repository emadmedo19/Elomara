import React from 'react';
import {createRoot} from 'react-dom/client';
import {PdfStatementModal} from '../../src/components/PdfStatementModal';
import type {Apartment,Building,Expense} from '../../src/types';
const count=Number(new URLSearchParams(location.search).get('count')||14);
const building:Building={id:'fixture',name:'عمارة اختبار الطباعة',address:'عنوان تجريبي',totalUnits:count,balance:5000,monthlyTarget:count*100,reserveFund:0,managerName:'',managerPhone:''};
const apartments:Apartment[]=Array.from({length:count},(_,i)=>({id:String(i),buildingId:'fixture',unitNumber:String(i+1),floor:1,residentName:'RES'+String(i+1).padStart(3,'0'),residentPhone:'',isOwner:true,monthlyFee:100,status:'pending',overdueMonths:1}));
const expenses:Expense[]=count>14?Array.from({length:40},(_,i)=>({id:String(i),title:'EXP'+String(i+1).padStart(3,'0'),category:'كهرباء',amount:25,date:'2026-11-12',vendor:'مورد تجريبي',approvedBy:'manager'})):[];
createRoot(document.getElementById('root')!).render(<><div style={{height:3000}}>APP-SCREEN-MUST-NOT-PRINT</div><PdfStatementModal building={building} apartments={apartments} expenses={expenses} onClose={()=>{}}/></>);
