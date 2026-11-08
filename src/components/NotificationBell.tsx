import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, CheckCheck, RefreshCw, Megaphone, Wrench, Wallet, CalendarDays, UserCheck, BarChart3, Settings, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { applyOtaUpdate, getOtaSnapshot, subscribeToOta } from '../services/otaUpdates';
interface Notice { id: string; title: string; body: string; category: string; created_at: string; read_at: string | null; manager_target: string; member_target: string; }
const categoryIcons = { app_updates: Download, announcements: Megaphone, maintenance_tickets: Wrench, payments: Wallet, expenses: Wallet, facility_bookings: CalendarDays, building_join_requests: UserCheck, building_polls: BarChart3, building_treasury_settings_audit: Wallet, app_settings: Settings };
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date); };
export function NotificationBell({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user, userProfile, isAdmin } = useAuth();
  const userId = user?.id;
  const buildingId = userProfile?.buildingId;
  const scope = `${userId || ''}:${buildingId || ''}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const [inbox, setInbox] = useState<{ scope: string; rows: Notice[]; count: number }>({ scope, rows: [], count: 0 });
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all'|'unread'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bell = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const ota = useSyncExternalStore(subscribeToOta, getOtaSnapshot, getOtaSnapshot);
  const rows = inbox.scope === scope ? inbox.rows : [];
  const unread = (inbox.scope === scope ? inbox.count : 0) + (ota.manifest ? 1 : 0);
  const refresh = useCallback(async () => {
    if (!userId || !buildingId) return;
    const version = ++request.current;
    setLoading(true);
    try {
      let listQuery = supabase.from('app_notifications').select('id,title,body,category,created_at,read_at,manager_target,member_target').eq('recipient_id',userId).eq('building_id',buildingId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(80);
      if (filter === 'unread') listQuery = listQuery.is('read_at',null);
      const [list, count] = await Promise.all([
        listQuery,
        supabase.from('app_notifications').select('id',{count:'exact',head:true}).eq('recipient_id',userId).eq('building_id',buildingId).is('read_at',null),
      ]);
      if (scopeRef.current !== scope || version !== request.current) return;
      if (list.error || count.error) { setError('تعذر تحديث الإشعارات. حاول مرة أخرى.'); return; }
      setInbox({scope,rows:(list.data || []) as Notice[],count:count.count || 0}); setError('');
    } catch { if (scopeRef.current===scope && version===request.current) setError('تعذر الاتصال. الإشعارات المحفوظة ستظهر عند عودة الاتصال.'); }
    finally { if (scopeRef.current===scope && version===request.current) setLoading(false); }
  },[userId,buildingId,scope,filter]);
  useEffect(() => { setOpen(false); setError(''); setFilter('all'); setSaving(false); },[scope]);
  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const show = () => { setOpen(true); void refresh(); };
    const interval = window.setInterval(update,45000);
    window.addEventListener('focus',update);
    document.addEventListener('visibilitychange',update);
    window.addEventListener('elomara-notifications-refresh',update);
    window.addEventListener('elomara-open-notifications',show);
    const channel = userId && buildingId ? supabase.channel(`inbox-${userId}-${buildingId}`).on('postgres_changes',{event:'*',schema:'public',table:'app_notifications',filter:`recipient_id=eq.${userId}`},update).subscribe() : null;
    return () => {
      ++request.current;
      window.clearInterval(interval);
      window.removeEventListener('focus',update); document.removeEventListener('visibilitychange',update);
      window.removeEventListener('elomara-notifications-refresh',update); window.removeEventListener('elomara-open-notifications',show);
      if (channel) void supabase.removeChannel(channel);
    };
  },[refresh,userId,buildingId]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow; document.body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key==='Escape') { event.stopImmediatePropagation(); setOpen(false); }
      if (event.key==='Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        const first=buttons[0],last=buttons.at(-1);
        if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
      }
    };
    const back = (event: PopStateEvent) => { event.stopImmediatePropagation(); setOpen(false); };
    document.addEventListener('keydown',keyboard,true); window.addEventListener('popstate',back,true);
    return () => { document.body.style.overflow=previous; document.removeEventListener('keydown',keyboard,true); window.removeEventListener('popstate',back,true); bell.current?.focus(); };
  },[open]);
  const markRead = async (notice?: Notice) => {
    if (!userId || !buildingId || saving) return;
    setSaving(true); setError('');
    try {
      const readAt = new Date().toISOString();
      let query = supabase.from('app_notifications').update({read_at:readAt}).eq('recipient_id',userId).eq('building_id',buildingId).is('read_at',null);
      if (notice) query=query.eq('id',notice.id);
      else if (rows[0]) query=query.lte('created_at',rows[0].created_at);
      else return;
      const {error:writeError}=await query;
      if (scopeRef.current !== scope) return;
      if (writeError) { setError('تعذر حفظ حالة القراءة. حاول مرة أخرى.'); return; }
      setInbox(current=>current.scope!==scope?current:{...current,rows:current.rows.map(row=>!notice||row.id===notice.id?{...row,read_at:row.read_at||readAt}:row),count:notice?Math.max(0,current.count-(notice.read_at?0:1)):0});
      void refresh();
    } catch { if (scopeRef.current===scope) setError('تعذر حفظ حالة القراءة. تأكد من الاتصال.'); }
    finally { setSaving(false); }
  };
  const go = (notice: Notice) => {
    if (!notice.read_at) void markRead(notice);
    setOpen(false); onNavigate(isAdmin?notice.manager_target:notice.member_target);
  };
  return <>
    <button type="button" ref={bell} className="notification-bell" aria-label={`الإشعارات${unread ? `، ${unread} غير مقروء` : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);void refresh();}}><Bell size={21} aria-hidden="true"/>{unread>0 && <span className="notification-badge" aria-hidden="true">{unread>99?'99+':unread}</span>}</button>
    {open && createPortal(<div className="notification-overlay" onTouchStart={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <div ref={dialog} dir="rtl" role="dialog" aria-modal="true" aria-labelledby="notification-title" data-notification-dialog className="notification-panel">
        <div className="notification-heading"><span className="settings-icon settings-icon-gold"><Bell size={25}/></span><div><h2 id="notification-title">الإشعارات</h2><p>{unread ? `${unread} إشعار غير مقروء` : 'كل تنبيهات حسابك في مكان واحد'}</p></div><button type="button" aria-label="إغلاق الإشعارات" onClick={()=>setOpen(false)}><X size={21}/></button></div>
        <div className="notification-toolbar"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>الكل</button><button type="button" aria-pressed={filter==='unread'} onClick={()=>setFilter('unread')}>غير المقروء</button><button type="button" aria-label="تحديث الإشعارات" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={17} className={loading?'animate-spin':''}/></button></div>
        {error && <p role="alert" className="settings-error">{error}</p>}
        <div className="notification-items" aria-busy={loading}>
          {ota.manifest && <div className="notification-item notification-unread"><span className="settings-icon settings-icon-blue"><Download size={23}/></span><div><strong>تحديث جديد للتطبيق</strong><p>احفظ شغلك المفتوح قبل التحديث؛ التطبيق هيعيد الفتح.</p><button type="button" className="notification-update" disabled={ota.phase==='downloading'||ota.phase==='applying'} onClick={()=>void applyOtaUpdate()}>{ota.phase==='downloading'||ota.phase==='applying'?'جارٍ التحديث…':'حدّث الآن'}</button></div></div>}
          {rows.filter(row=>filter==='all'||!row.read_at).map(row=>{const Icon=categoryIcons[row.category as keyof typeof categoryIcons]||Bell;return <button type="button" key={row.id} className={`notification-item ${row.read_at?'':'notification-unread'}`} onClick={()=>go(row)}><span className={`settings-icon settings-icon-${row.category==='maintenance_tickets'?'violet':row.category==='announcements'?'blue':'teal'}`}><Icon size={23}/></span><span><strong>{row.title}</strong><span className="notification-body">{row.body}</span><time dateTime={row.created_at}>{dateLabel(row.created_at)}</time></span>{!row.read_at && <span className="notification-dot" aria-label="غير مقروء"/>}</button>})}
          {!ota.manifest && !rows.some(row=>filter==='all'||!row.read_at) && <p className="notification-empty" role="status">{loading?'جارٍ تحميل الإشعارات…':error?'اضغط تحديث للمحاولة مرة أخرى.':filter==='unread'?'لا توجد إشعارات غير مقروءة':'لا توجد إشعارات حاليًا'}</p>}
        </div>
        <div className="notification-footer"><small>أحدث ٨٠ إشعارًا • يتم التحديث تلقائيًا</small><button type="button" disabled={saving||!rows.some(row=>!row.read_at)} onClick={()=>void markRead()}><CheckCheck size={17}/>قراءة الكل</button></div>
      </div>
    </div>,document.body)}
  </>;
}
