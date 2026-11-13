import {build} from 'esbuild';
import {mkdirSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
const out=process.argv[2]||'/tmp/elomara-play-billing';mkdirSync(out,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import{MoreView}from'./src/components/MoreView';window.state={role:new URLSearchParams(location.search).get('role')||'admin',status:'trial',purchases:[],calls:[]};createRoot(document.getElementById('root')).render(<MoreView items={[]} buildingId="building" onBack={()=>{}} onOpenAppSettings={()=>{}} onSignOut={()=>{}}/>);`},bundle:true,format:'esm',outfile:out+'/check.js',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/services\/playBilling$/},()=>({path:'billing',namespace:'fixture'}));
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'api',namespace:'fixture'}));
 b.onResolve({filter:/AppTour$/},()=>({path:'tour',namespace:'fixture'}));
 b.onResolve({filter:/AccountDeletionButton$/},()=>({path:'delete',namespace:'fixture'}));
 b.onResolve({filter:/^@capacitor\/(app|browser)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='billing'?`
 export const hasPlayBilling=()=>true;export const PlayBilling={async catalog(){return{products:[{productId:'elomara_building_monthly',price:'٩٩٫٠٠ ج.م.',offerToken:'monthly'},{productId:'elomara_building_annual',price:'٩٩٩٫٠٠ ج.م.',offerToken:'annual'}]}},async purchase(p){window.state.calls.push(p);return{purchases:[{token:'server-verified-token',pending:false}]}},async restore(){return{purchases:window.state.purchases}},async addListener(){return{async remove(){}}}};export async function billingRequest(buildingId,action,token){window.state.calls.push({buildingId,action,token});if(window.state.role!=='admin')throw Error('Administrator required');if(action==='context')return{available:true,accountId:'account',profileId:'building'};if(action==='verify'){window.state.status='active';return{verified:true}};return{ok:true}};`
 :a.path==='api'?`export const supabase={rpc:async(name,args)=>name==='get_building_subscription'&&window.state.role==='admin'?{data:{status:window.state.status,trial_ends_at:'2026-11-27',days_remaining:14},error:null}:name==='redeem_building_vip'? (window.state.status='vip',{data:{ok:true},error:null}):{data:null,error:{message:'Forbidden'}}};`
 :a.path==='tour'?`export const TourHelpButton=()=>null;`
 :a.path==='delete'?`export const AccountDeletionButton=()=>null;`
 :a.path.endsWith('/app')?`export const App={async addListener(){return{async remove(){}}}};`
 :`export const Browser={async open({url}){window.state.manageUrl=url}};`}));
}}]});
const css=readdirSync('dist/assets').find(n=>n.startsWith('index-')&&n.endsWith('.css'));copyFileSync('dist/assets/'+css,out+'/check.css');writeFileSync(out+'/index.html','<html dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/check.css"><div id="root"></div><script type="module" src="/check.js"></script></html>');
