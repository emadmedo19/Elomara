import React, { useRef, useState } from 'react';
export type PosterWall = { x: number; y: number; width: number; height: number };
export function PosterWallPicker({ image, warning, busy, onApply, onCancel }: {
  image: string; warning: string; busy: boolean;
  onApply: (wall: PosterWall) => void; onCancel: () => void;
}) {
  const [wall, setWall] = useState<PosterWall | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  const valid = wall && wall.width >= .32 && wall.height >= .25 && wall.width * wall.height >= .14;
  return <div className="w-full max-w-md space-y-3 text-right" dir="rtl">
    <h2 className="font-bold text-slate-900">حدد مكان الكلام على الصورة</h2>
    <p role="status" className="text-xs leading-6 text-amber-800">{warning}</p>
    <p className="text-xs leading-6 text-slate-600">اسحب بإصبعك من ركن الحائط الفاضي للركن المقابل. راجع الصورة؛ الكتابة الموجودة فيها بالفعل لن تُحذف. بلوحة المفاتيح: اضغط Enter ثم حرّك المساحة بالأسهم.</p>
    <div role="group" aria-label="تحديد مساحة الحائط" tabIndex={0}
      className="relative overflow-hidden rounded-xl border border-slate-300 outline-teal-600" style={{ touchAction: 'none' }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); setWall({ x: .1, y: .1, width: .8, height: .6 }); }
        else if (wall && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault(); setWall({ ...wall,
            x: Math.max(0, Math.min(1-wall.width, wall.x + (event.key==='ArrowLeft'?-.02:event.key==='ArrowRight'?.02:0))),
            y: Math.max(0, Math.min(1-wall.height, wall.y + (event.key==='ArrowUp'?-.02:event.key==='ArrowDown'?.02:0))) });
        }
      }}
      onPointerDown={event => { if (busy) return; start.current = point(event); setWall(null); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        if (!start.current) return; const p = point(event); const a = start.current;
        setWall({ x: Math.min(a.x,p.x), y: Math.min(a.y,p.y), width: Math.abs(p.x-a.x), height: Math.abs(p.y-a.y) });
      }}
      onPointerUp={() => { start.current=null; }} onPointerCancel={() => { start.current=null; }}>
      <img src={image} alt="الصورة الأصلية لاختيار الحائط" draggable={false} className="block h-auto w-full select-none" />
      {wall && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-teal-500 bg-teal-400/10" style={{ left: `${wall.x*100}%`, top: `${wall.y*100}%`, width: `${wall.width*100}%`, height: `${wall.height*100}%` }} />}
    </div>
    {!valid && <p className="text-xs text-slate-600">حدد مساحة واسعة تكفي للعنوان والتفاصيل.</p>}
    <button type="button" disabled={!valid || busy} onClick={() => { if (wall && valid) onApply(wall); }} className="w-full rounded-xl bg-teal-700 p-3 text-sm font-bold text-white disabled:opacity-40">كتابة الإعلان في المساحة المحددة</button>
    <button type="button" disabled={busy} onClick={onCancel} className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-700">إلغاء واختيار صورة أخرى</button>
  </div>;
}
