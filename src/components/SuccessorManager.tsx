import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
export function SuccessorManager() {
 const {user,userProfile,isAdmin}=useAuth();
 const [members,setMembers]=useState<{id:string;full_name:string}[]>([]);
 const [selected,setSelected]=useState(''); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 useEffect(()=>{ let active=true;
 if(isAdmin && userProfile?.buildingId) void supabase.from('profiles').select('id,full_name').eq('building_id',userProfile.buildingId).eq('approved',true).is('disabled_at',null).in('role',['owner','tenant']).then(({data,error})=>{if(active){setMembers(data||[]);if(error)setNotice('تعذر تحميل الأعضاء. أعد فتح الصفحة.');}});
 return ()=>{active=false;}; },[isAdmin,user?.id,userProfile?.buildingId]);
 if(!isAdmin)return null;
 const promote=async()=>{if(!selected||busy||!window.confirm('سيحصل هذا العضو على صلاحيات مدير العمارة كاملة. هل تؤكد؟'))return;
 setBusy(true);try{const {error}=await supabase.rpc('add_successor_manager',{member_id:selected});setNotice(error?'تعذر إضافة المدير. حاول مرة أخرى.':'تمت إضافة المدير البديل. يمكنك الآن تأكيد حذف حسابك.');if(!error){setMembers(rows=>rows.filter(row=>row.id!==selected));setSelected('');}}catch{setNotice('تعذر الاتصال. حاول مرة أخرى.');}finally{setBusy(false);}};
 return <section className="my-4 rounded-xl border p-3"><h3>إضافة مدير بديل</h3><p>اختر عضوًا مسجلًا ومقبولًا في عمارتك لمنحه صلاحيات الإدارة. إذا لم يسجل بعد، اطلب منه الانضمام بكود العمارة ووافق على طلبه أولًا.</p><select aria-label="المدير البديل" className="w-full border rounded-xl p-2 my-2" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">اختر عضوًا</option>{members.map(row=><option key={row.id} value={row.id}>{row.full_name}</option>)}</select><button type="button" disabled={!selected||busy} onClick={()=>void promote()} className="settings-save">{busy?'جارٍ الحفظ…':'إضافة كمدير'}</button>{notice&&<p role="status">{notice}</p>}</section>;
}
