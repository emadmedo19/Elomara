import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = resolve(process.argv[2] || '/tmp/elomara-membership-ui');
const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(output, { recursive: true });

await build({entryPoints:[join(root,'tests/browser/membership-fixture.tsx')],bundle:true,format:'esm',outfile:join(output,'check.js'),define:{'import.meta.env':'{}'},plugins:[{name:'synthetic-api-only',setup(b){
b.onResolve({filter:/lib\/supabase$/},()=>({path:'api',namespace:'fixture'}));b.onResolve({filter:/lib\/neon$/},()=>({path:'neon',namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='neon'?`export const isNeonBackend=true;export const neonEmailRequest=async()=>({});export const startNeonGoogleSignIn=async()=>{};`:`
const scenario=new URLSearchParams(location.search).get('scenario');
const user={id:'manager',email:'fixture@example.invalid',user_metadata:{}};
const state=window.mock={fixture:'elomara-membership-fixture-v1',created:false,staleReads:['error','switch'].includes(scenario)?100:2,calls:0,reads:0,currentUser:user,lateRead:false,building:null,apartments:[],emit(){}};
const row=(pending=false,id='manager')=>({id,full_name:'Fixture',role:pending||state.forcePending?'pending':'building_admin',approved:!(pending||state.forcePending),building_id:state.created&&!pending?'new-building':null,apartment_id:null,disabled_at:null,updated_at:'2026-11-10'});
function query(table){let single=false,filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},in(){return q},order(){return q},is(){return q},limit(){return q},abortSignal(){return q},maybeSingle(){single=true;return q},single(){single=true;return q},then(resolve,reject){let result;
if(table==='profiles'){state.reads++;if(['hang','switch-inflight'].includes(scenario)&&state.created&&!state.unhang&&filters.id==='manager')return new Promise(()=>{}).then(resolve,reject);const id=filters.id||state.currentUser.id;if(id!=='manager')result={data:row(true,id),error:null};else if(state.lateRead){state.lateRead=false;return new Promise(r=>setTimeout(()=>r({data:row(true),error:null}),180)).then(resolve,reject)}else if(state.created&&state.staleReads>0){state.staleReads--;result={data:row(true),error:null}}else result={data:row(scenario==='pending'&&!state.created),error:null};}
else result={data:table==='apartments'?state.apartments:table==='buildings'?(state.building?[state.building]:[]):single?null:[],error:null,count:0};return Promise.resolve(result).then(resolve,reject)}};return q}
export const supabase={from:query,auth:{onAuthStateChange(cb){state.emit=(event,who=state.currentUser)=>{state.currentUser=who;cb(event,who?{user:who}:null)};return{data:{subscription:{unsubscribe(){}}}}},async getSession(){return{data:{session:state.currentUser?{user:state.currentUser}:null}}},async refreshSession(){return{data:{session:{user:state.currentUser}}}},async signOut(){state.emit('SIGNED_OUT',null);return{error:null}}},channel(){const q={on(){return q},subscribe(){return q}};return q},removeChannel(){},functions:{async invoke(){return{data:{},error:null}}},async rpc(name,args){if(name==='create_manager_building'||name==='create_building_with_opening_balance'){state.calls++;if(['race','early-race'].includes(scenario)){state.lateRead=true;state.emit('TOKEN_REFRESHED');await new Promise(r=>setTimeout(r,scenario==='early-race'?250:35))}state.created=true;const d=args.p_details||{name:args.building_name,address:args.building_address,totalUnits:args.units_count,totalFloors:args.floors_count};state.building={id:'new-building',name:d.name,address:d.address,total_units:d.totalUnits,total_floors:d.totalFloors,balance:0,monthly_target:d.monthlyTarget||0,reserve_fund:d.reserveFund||0,manager_name:d.managerName||'',manager_phone:d.managerPhone||''};state.apartments=Array.from({length:Number(d.totalUnits||0)},(_,i)=>({id:'apt-'+(i+1),building_id:'new-building',unit_number:String(i+1),floor:[1,1,1,1,2,2,2,2,3,3,3,4,4,4][i]||1,resident_name:'',resident_phone:'',is_owner:false,monthly_fee:0,payment_status:'pending',overdue_months:0,paid_amount:0,credit_balance:0}));return{data:name==='create_manager_building'?state.building:'new-building',error:null}}return{data:null,error:null}}};
`}))
}}]});

const assets=join(root,'dist/assets');
copyFileSync(join(assets,readdirSync(assets).find(n=>n.startsWith('index-')&&n.endsWith('.css'))),join(output,'check.css'));
writeFileSync(join(output,'index.html'), '<html dir="rtl" data-appearance="light"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/check.css"><div id="root"></div><script type="module" src="/check.js"></script></html>');
console.log('Synthetic membership fixture built at '+output);
