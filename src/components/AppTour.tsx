import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, BookOpen, Building2, Check, Eye, List, Play, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { setupSteps, tourDialogs, tourSteps, type TourDialog, type TourMode } from '../data/appTourSteps';

type Rect = { left:number; top:number; width:number; height:number };
const completed = new Set<string>();
const keyFor = (id:string,mode:TourMode) => `elomara:tour:v1:${id}:${mode}`;
const find = (name:string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).find(node => node.getClientRects().length > 0);
const sleep = (ms:number) => new Promise<void>(resolve => setTimeout(resolve,ms));
export function TourHelpButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event('elomara:open-tour'))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"><BookOpen size={18}/>دليل التطبيق</button>;
}
export function AppTour({mode,onNavigate,currentPage}:{mode:TourMode;onNavigate?:(page:string)=>void;currentPage?:string}) {
  const {user} = useAuth();
  const [open,setOpen] = useState(false);
  const [paused,setPaused] = useState(false);
  const [index,setIndex] = useState(0);
  const [journey,setJourney] = useState<'manager'|'resident'|null>(null);
  const [spot,setSpot] = useState<Rect|null>(null);
  const [position,setPosition] = useState<React.CSSProperties>({bottom:12,left:12,right:12});
  const [status,setStatus] = useState<'loading'|'ready'|'missing'|'dirty'>('loading');
  const [menu,setMenu] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement|null>(null);
  const owned = useRef<{kind:TourDialog;root:HTMLElement}|null>(null);
  const dirty = useRef(false);
  const originalPage = useRef(currentPage);
  const exploring = useRef(paused);exploring.current=paused;
  const navigation = useRef(onNavigate);navigation.current=onNavigate;
  const titleId=useId(),maskId=useId().replace(/:/g,'');
  const steps = mode==='setup'&&journey ? [...tourSteps.setup,...setupSteps[journey]] : tourSteps[mode];
  const step=steps[index]||steps[0];
  const choosing=mode==='setup'&&index===0;
  const chapters=steps.flatMap((item,i)=>i===0||item.section!==steps[i-1].section?[{label:item.section,index:i}]:[]);
  useBodyScrollLock(open&&!paused);
  const closeOwned=() => {
    const active=owned.current;
    if(!active||!active.root.isConnected){owned.current=null;dirty.current=false;return true;}
    if(dirty.current)return false;
    find(tourDialogs[active.kind].close)?.click();
    owned.current=null;return true;
  };
  const close=() => {
    if(user){const key=keyFor(user.id,mode);completed.add(key);try{localStorage.setItem(key,'done');}catch{/* optional */}}
    const cleaned=dirty.current?false:closeOwned();
    if(!cleaned){
      // The user started using the real form. Keep that page and promote the
      // tour entry to an ordinary page entry instead of going Back over it.
      const {appTour: _marker,...state}=window.history.state||{};
      const url=new URL(location.href);
      if(mode==='manager'&&currentPage)url.searchParams.set('tab',currentPage);
      window.history.replaceState({...state,...(mode==='resident'?{residentPage:currentPage}:{})},'',url);
    }
    setOpen(false);setPaused(false);setMenu(false);setSpot(null);
    if(cleaned&&originalPage.current)navigation.current?.(originalPage.current);
  };
  const closeRef=useRef(close);closeRef.current=close;
  const move=(next:number) => {
    if(owned.current?.kind!==steps[next]?.dialog&&!closeOwned()){setStatus('dirty');return;}
    setMenu(false);setStatus('loading');setIndex(next);
  };
  useEffect(()=>{
    if(!user)return;
    const start=()=>{if(!owned.current?.root.isConnected){owned.current=null;dirty.current=false;}originalPage.current=currentPage;setIndex(0);setJourney(null);setPaused(false);setOpen(true);setMenu(false);};
    window.addEventListener('elomara:open-tour',start);
    return()=>window.removeEventListener('elomara:open-tour',start);
  },[user?.id,currentPage]);
  useEffect(()=>{
    if(!user||!Number.isFinite(Date.parse(user.created_at))||Date.parse(user.created_at)<Date.parse('2026-11-13T00:00:00Z'))return;
    const key=keyFor(user.id,mode);if(completed.has(key))return;
    try{if(localStorage.getItem(key))return;}catch{/* optional */}
    setOpen(true);
  },[user?.id,mode]);
  useEffect(()=>{
    if(!open)return;
    const previousFocus=document.activeElement as HTMLElement|null;
    const marker=crypto.randomUUID();
    window.history.pushState({...window.history.state,appTour:marker},'',location.href);
    const back=(event:PopStateEvent)=>{event.stopImmediatePropagation();closeRef.current();};
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key!=='Tab'||!panel.current||!panel.current.getClientRects().length)return;
      const controls=panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),[tabindex="0"]');
      const first=controls[0],last=controls[controls.length-1];
      if(!panel.current.contains(document.activeElement)||document.activeElement===panel.current){event.preventDefault();(event.shiftKey?last:first)?.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    const input=(event:Event)=>{if(owned.current?.root.contains(event.target as Node)||(exploring.current&&event.target instanceof Element&&!event.target.closest('[data-app-tour],.app-tour-resume')))dirty.current=true;};
    window.addEventListener('popstate',back,true);document.addEventListener('keydown',key,true);document.addEventListener('input',input,true);document.addEventListener('change',input,true);
    return()=>{
      window.removeEventListener('popstate',back,true);document.removeEventListener('keydown',key,true);document.removeEventListener('input',input,true);document.removeEventListener('change',input,true);
      if(window.history.state?.appTour===marker){
        // Consume only the tour's own history entry, so App does not close a
        // real form the user edited while exploring the full page.
        window.addEventListener('popstate',event=>event.stopImmediatePropagation(),{once:true,capture:true});window.history.back();
      }
      previousFocus?.focus({preventScroll:true});
    };
  },[open]);
  useEffect(()=>{
    if(!open||paused)return;
    let active=true;
    const measure=()=>{
      if(!active)return;
      const node=targetRef.current;
      if(!node&&!choosing)return;
      const vw=window.innerWidth,vh=window.innerHeight;
      const w=Math.min(vw-24,vw>=1024?360:420);
      const ph=Math.min(panel.current?.offsetHeight||240,vh*.48);
      const rect=node?.isConnected?node.getBoundingClientRect():null;
      let left=(vw-w)/2,top=vh-ph-14;
      if(rect){
        if(vw>=1024&&rect.left>w+36){left=rect.left-w-22;top=Math.max(16,Math.min(vh-ph-16,rect.top+(rect.height-ph)/2));}
        else if(vw>=1024&&vw-rect.right>w+36){left=rect.right+22;top=Math.max(16,Math.min(vh-ph-16,rect.top+(rect.height-ph)/2));}
        else if(rect.top>=ph+32)top=Math.max(12,rect.top-ph-20);
        else if(vh-rect.bottom>=ph+32)top=Math.min(vh-ph-12,rect.bottom+20);
        else if(rect.top+rect.height/2>vh/2)top=12;
        setSpot({left:rect.left-7,top:rect.top-7,width:rect.width+14,height:rect.height+14});
      }else setSpot(null);
      setPosition({left:Math.max(12,Math.min(vw-w-12,left)),top:Math.max(12,top),width:w});
    };
    const waitFor=async(name:string)=>{
      for(let retry=0;active&&retry<40;retry++){const node=find(name);if(node)return node;await sleep(60);}
      return undefined;
    };
    const show=async()=>{
      setStatus('loading');targetRef.current=null;
      if(step.page)navigation.current?.(step.page);
      await sleep(80);if(!active)return;
      if(step.dialog){
        const config=tourDialogs[step.dialog];
        let root=find(config.root);
        if(!root){const opener=await waitFor(config.open);if(!active)return;opener?.click();root=await waitFor(config.root);}
        if(!active)return;
        if(root&&owned.current?.root!==root){owned.current={kind:step.dialog,root};dirty.current=false;}
      }
      const target=step.target?await waitFor(step.target):undefined;
      if(!active)return;
      targetRef.current=target||null;
      if(!target)setSpot(null);
      if(target){
        target.dataset.tourActive='true';
        target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      }
      await sleep(80);if(!active)return;
      if(target && target.getBoundingClientRect().height < innerHeight*.45){
        // Give the real control room above the coachmark by scrolling its
        // actual page/form container, instead of clipping a large fake spotlight.
        const header=document.querySelector<HTMLElement>('header');
        const headerStyle=header?getComputedStyle(header).position:'';
        const topGap=!step.dialog&&header&&['sticky','fixed'].includes(headerStyle)
          ? Math.max(90,header.getBoundingClientRect().bottom+14) : 90;
        const delta=target.getBoundingClientRect().top-topGap;
        let parent=target.parentElement;
        while(parent && parent!==document.body){
          if(/auto|scroll/.test(getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight){parent.scrollTop+=delta;break;}
          parent=parent.parentElement;
        }
        if(!parent||parent===document.body)window.scrollBy({top:delta,behavior:'instant'});
      }
      measure();
      // Wait for the app's existing page entrance animation before focusing.
      await sleep(360);if(active){measure();setStatus(step.target&&!target?'missing':'ready');panel.current?.focus({preventScroll:true});}
    };
    void show();
    const observer=new ResizeObserver(measure);if(panel.current)observer.observe(panel.current);
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
    return()=>{active=false;if(targetRef.current)delete targetRef.current.dataset.tourActive;observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[open,paused,index,journey,step.page,step.dialog,step.target]);
  // A role change or navigation may remove this guide while it owns a dialog.
  useEffect(()=>()=>{if(!dirty.current&&owned.current?.root.isConnected)find(tourDialogs[owned.current.kind].close)?.click();},[]);
  if(!open||!user)return null;
  if(paused)return createPortal(<div className="app-tour-resume" dir="rtl"><button type="button" onClick={()=>setPaused(false)}><Play size={17}/>متابعة الجولة</button><button type="button" onClick={close} aria-label="إنهاء الجولة"><X size={18}/></button></div>,document.body);
  return createPortal(<div data-app-tour data-tour-dialog={owned.current?.kind} data-tour-edited={dirty.current} data-tour-state={status} data-tour-step={index} data-tour-feature={step.section} dir="rtl" className="app-tour-layer">
    <svg className="app-tour-shade" aria-hidden="true"><defs><mask id={maskId}><rect width="100%" height="100%" fill="white"/>{spot&&<rect x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx="12" fill="black"/>}</mask></defs><rect width="100%" height="100%" fill="#062b35" opacity={spot && spot.width < innerWidth * .9 ? .28 : .12} mask={`url(#${maskId})`}/></svg>
    {spot&&<div aria-hidden="true" className="app-tour-spot" style={spot}><span/></div>}
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-body`} className="app-tour-card" style={position}>
      <div className="app-tour-header"><span className="app-tour-mark"><BookOpen size={19}/></span><div><b>دليل {mode==='resident'?'العضو':mode==='setup'?'البداية':'المدير'}</b><span>{step.section}</span></div><button type="button" onClick={close} aria-label="إغلاق الجولة"><X size={18}/></button></div>
      <div className="app-tour-progress" role="progressbar" aria-label="تقدم الجولة" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index+1}><span style={{width:`${(index+1)/steps.length*100}%`}}/></div>
      <div key={`${journey}-${index}`} className="app-tour-copy" aria-live="polite" aria-atomic="true"><h2 id={titleId}>{step.title}</h2><p id={`${titleId}-body`}>{step.body}</p></div>
      {status==='dirty'&&<p role="status" className="app-tour-message">كتبت بيانات في النموذج. احفظها أو ألغِها من الصفحة قبل الانتقال لجزء تاني.</p>}
      {status==='missing'&&<p role="status" className="app-tour-message">الجزء ده مش ظاهر حاليًا. تقدر تشوف الصفحة كاملة أو تنتقل للخطوة التالية.</p>}
      {choosing?<div className="app-tour-choices"><button type="button" onClick={()=>{setJourney('manager');move(1);}}><Building2 size={18}/>أنا مدير عمارة</button><button type="button" onClick={()=>{setJourney('resident');move(1);}}><Users size={18}/>أنا ساكن أو عضو</button></div>:<div className="app-tour-controls"><button type="button" disabled={index===0} onClick={()=>move(index-1)} aria-label="السابق"><ArrowRight size={18}/></button><span>{index+1} <small>من {steps.length}</small></span><button type="button" className="app-tour-next" disabled={status==='loading'} onClick={()=>index===steps.length-1?close():move(index+1)}>{index===steps.length-1?'ابدأ الاستخدام':'التالي'}{index===steps.length-1?<Check size={17}/>:<ArrowLeft size={17}/>}</button></div>}
      <div className="app-tour-tools"><button type="button" onClick={()=>{setPaused(true);setMenu(false);}}><Eye size={14}/>عرض الصفحة كاملة</button>{!choosing&&<button type="button" onClick={()=>setMenu(value=>!value)} aria-expanded={menu}><List size={14}/>فهرس الجولة</button>}<button type="button" onClick={close}>تخطي الجولة</button></div>
      {menu&&<div className="app-tour-index">{chapters.map(chapter=><button type="button" key={chapter.index} aria-current={step.section===chapter.label?'step':undefined} onClick={()=>move(chapter.index)}>{chapter.label}<ArrowLeft size={14}/></button>)}</div>}
    </section>
  </div>,document.body);
}
