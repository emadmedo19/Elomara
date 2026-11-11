import React, { useState } from 'react';
import { Announcement } from '../types';
import { supabase } from '../lib/supabase';
import { 
  Sparkles, Image as ImageIcon, Wand2, Download, Pin, 
  RefreshCw, Check, AlertCircle, Layers, Palette
} from 'lucide-react';

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch] || ch));

const buildAnnouncementPoster = (prompt: string, buildingName: string, aspectRatio: string) => {
  const sizes: Record<string, [number, number]> = {'1:1':[1080,1080],'16:9':[1280,720],'3:4':[900,1200],'9:16':[900,1600]};
  const [w,h] = sizes[aspectRatio] || sizes['1:1'];
  const lower = prompt.toLowerCase();
  const isWater = /مياه|سباك|تسريب|حنفية|water|plumb/.test(lower);
  const isElevator = /مصعد|اسانسير|أسانسير|elevator|lift/.test(lower);
  const isCleaning = /نظاف|تنظيف|clean/.test(lower) && !/سداد|اشتراك/.test(lower);
  const isGarage = /جراج|سيار|موقف|garage|parking/.test(lower);
  const isElectricity = /كهرب|التيار/.test(lower);
  const isMeeting = /اجتماع|الجمعية العمومية/.test(lower);
  const isSubscription = /سداد|اشتراك/.test(lower);
  const isQuiet = /هدوء|الضوضاء|الأصوات/.test(lower);
  const title = isWater ? 'تنبيه بخصوص المياه' : isElevator ? 'تنبيه صيانة المصعد' : isCleaning ? 'حافظ على نظافة العمارة' : isGarage ? 'تنظيم مواقف السيارات' : isElectricity ? 'تنبيه بخصوص الكهرباء' : isMeeting ? 'دعوة لاجتماع السكان والملاك' : isSubscription ? 'تذكير بسداد الاشتراك' : isQuiet ? 'الحفاظ على الهدوء' : 'إعلان هام للسادة السكان';
  const subtitle = isWater ? 'تنويه من إدارة العقار بخصوص خدمة المياه' : isElevator ? 'حرصاً على سلامتكم، يرجى الالتزام بتعليمات الاستخدام' : isCleaning ? 'نظافة المداخل والممرات مسؤولية الجميع' : isGarage ? 'يرجى الالتزام بالأماكن المخصصة وعدم إعاقة الحركة' : 'تنويه مهم من إدارة العقار';
  const accent = isWater ? '#38bdf8' : isCleaning ? '#34d399' : '#d8b56a';
  const icon = isWater
    ? '<path d="M540 310 C500 365 470 400 470 445 A70 70 0 0 0 610 445 C610 400 580 365 540 310Z" fill="none" stroke="'+accent+'" stroke-width="18"/><path d="M500 450 Q540 485 580 450" fill="none" stroke="'+accent+'" stroke-width="12" stroke-linecap="round"/>'
    : isElevator
    ? '<rect x="445" y="320" width="190" height="260" rx="18" fill="none" stroke="'+accent+'" stroke-width="16"/><path d="M540 320V580 M470 350L510 390 M610 350L570 390 M470 550L510 510 M610 550L570 510" stroke="'+accent+'" stroke-width="12" stroke-linecap="round"/>'
    : isCleaning
    ? '<path d="M480 350L590 460 M540 300L650 410 M455 485L585 355" stroke="'+accent+'" stroke-width="22" stroke-linecap="round"/><path d="M430 520L490 580" stroke="'+accent+'" stroke-width="28" stroke-linecap="round"/>'
    : isGarage
    ? '<path d="M430 500L465 405Q475 380 505 380H575Q605 380 615 405L650 500V550H430Z" fill="none" stroke="'+accent+'" stroke-width="16"/><circle cx="480" cy="540" r="24" fill="'+accent+'"/><circle cx="600" cy="540" r="24" fill="'+accent+'"/>'
    : '<path d="M540 315L670 555H410Z" fill="none" stroke="'+accent+'" stroke-width="18" stroke-linejoin="round"/><path d="M540 395V475 M540 515V520" stroke="'+accent+'" stroke-width="18" stroke-linecap="round"/>';
  const words = prompt.trim().replace(/\s+/g, ' ').split(' ');
  const description: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    if (candidate.length > 52 && currentLine) {
      description.push(currentLine);
      currentLine = word;
    } else currentLine = candidate;
    if (description.length === 7) break;
  }
  if (currentLine && description.length < 7) description.push(currentLine);
  const safeDescription = description.map(line => escapeXml(line));
  const safeTitle = escapeXml(title), safeSubtitle = escapeXml(subtitle), safeBuilding = escapeXml(buildingName || 'إدارة العمارة');
  const fontSize = w < h ? 42 : 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1080 1080">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10283d"/><stop offset="1" stop-color="#07506a"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#b58a45"/><stop offset=".5" stop-color="#f4d99b"/><stop offset="1" stop-color="#b58a45"/></linearGradient><pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#ffffff" opacity=".10"/></pattern></defs>
    <rect width="1080" height="1080" fill="url(#bg)"/><rect width="1080" height="1080" fill="url(#dots)"/>
    <circle cx="930" cy="120" r="260" fill="#ffffff" opacity=".035"/><circle cx="90" cy="950" r="300" fill="#ffffff" opacity=".035"/>
    <path d="M48 48H1032V1032H48Z" fill="none" stroke="url(#gold)" stroke-width="5" rx="28"/><path d="M78 78H1002V1002H78Z" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>
    <rect x="350" y="115" width="380" height="58" rx="29" fill="#ffffff" fill-opacity=".10" stroke="#ffffff" stroke-opacity=".22"/><text x="540" y="153" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="26" font-weight="bold" fill="#f6dfad">${safeBuilding}</text>
    <circle cx="540" cy="430" r="175" fill="#ffffff" fill-opacity=".07" stroke="#ffffff" stroke-opacity=".15" stroke-width="3"/>${icon}
    <rect x="170" y="650" width="740" height="5" rx="3" fill="url(#gold)"/>
    <text x="540" y="720" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="52" font-weight="bold" fill="#ffffff">${safeTitle}</text>
    <text x="540" y="775" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="27" fill="#dceaf1">${safeSubtitle}</text>
    <text x="540" y="835" text-anchor="middle" direction="rtl" font-family="Tahoma,Arial,sans-serif" font-size="21" fill="#e2edf2">${safeDescription.map((line, index) => `<tspan x="540" dy="${index === 0 ? 0 : 24}">${line}</tspan>`).join('')}</text>
    <text x="540" y="1020" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="22" fill="#f6dfad">مع تحيات إدارة العقار</text>
  </svg>`;
  return {svg, title};
};

interface AiStudioViewProps {
  buildingName: string;
  onPinAnnouncement: (announcement: Omit<Announcement, 'id'>) => Promise<boolean>;
}

export const AiStudioView: React.FC<AiStudioViewProps> = ({
  buildingName,
  onPinAnnouncement,
}) => {
  const [prompt, setPrompt] = useState(
    'حرصًا على سلامتكم، ستُجرى صيانة المصعد يوم [التاريخ].\nمن [وقت البدء] إلى [وقت الانتهاء].\nيرجى عدم استخدام المصعد أثناء الصيانة.\nشكرًا لتعاونكم.'
  );
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  // Pinned state feedback
  const [isPinned, setIsPinned] = useState(false);

  // Resident-facing notices: edit the bracketed details before generating.
  const templates = [
    {
      title: 'صيانة المصعد الدورية',
      prompt: 'حرصًا على سلامتكم، ستُجرى صيانة المصعد يوم [التاريخ].\nمن [وقت البدء] إلى [وقت الانتهاء].\nيرجى عدم استخدام المصعد أثناء الصيانة.\nشكرًا لتعاونكم.',
      aspectRatio: '1:1',
    },
    {
      title: 'انقطاع المياه',
      prompt: 'ستتوقف المياه مؤقتًا لإجراء أعمال الصيانة يوم [التاريخ].\nمن [وقت البدء] إلى [وقت الانتهاء].\nيرجى توفير احتياجاتكم مسبقًا وإغلاق الصنابير.\nشكرًا لتفهّمكم.',
      aspectRatio: '3:4',
    },
    {
      title: 'انقطاع الكهرباء',
      prompt: 'ستتوقف الكهرباء مؤقتًا لأعمال الصيانة يوم [التاريخ].\nمن [وقت البدء] إلى [وقت الانتهاء].\nيرجى فصل الأجهزة الحساسة قبل الموعد.\nشكرًا لتفهّمكم.',
      aspectRatio: '1:1',
    },
    {
      title: 'نظافة المداخل والممرات',
      prompt: 'عمارتنا أجمل بتعاوننا.\nيرجى وضع القمامة في الأماكن المخصصة لها، والحفاظ على نظافة المداخل والسلالم.\nاتركوا الممرات خالية لراحة الجميع وسلامتهم.',
      aspectRatio: '3:4',
    },
    {
      title: 'تنظيم مواقف السيارات بالجراج',
      prompt: 'نظام الجراج راحة للجميع.\nيرجى الوقوف في المكان المخصص لكل سيارة، وترك المداخل والمخارج والممرات خالية.\nشكرًا لاحترام حقوق الجيران.',
      aspectRatio: '16:9',
    },
    {
      title: 'اجتماع السكان والملاك',
      prompt: 'يسعدنا حضوركم اجتماع السكان والملاك.\nيوم [التاريخ] — الساعة [الوقت].\nالمكان: [المكان].\nللمناقشة: [موضوع الاجتماع].\nمشاركتكم تصنع الفرق.',
      aspectRatio: '1:1',
    },
    {
      title: 'تذكير بسداد الاشتراك',
      prompt: 'معًا نحافظ على انتظام خدمات العمارة.\nيرجى سداد اشتراك شهر [الشهر] قبل [آخر موعد للسداد].\nمساهمتكم تدعم الصيانة والنظافة والحراسة.\nإذا سبق السداد، يرجى تجاهل التذكير.',
      aspectRatio: '1:1',
    },
    {
      title: 'تعليمات الهدوء',
      prompt: 'هدوء عمارتنا يبدأ بمراعاتنا لبعض.\nيرجى خفض الأصوات وتجنّب أعمال الصيانة المزعجة خلال فترة الراحة.\nمن [بداية فترة الهدوء] إلى [نهاية فترة الهدوء].\nشكرًا لذوقكم وتعاونكم.',
      aspectRatio: '3:4',
    },
  ];

  const resetPreview = () => {
    setGeneratedImageUrl(null);
    setIsPinned(false);
    setErrorMessage(null);
  };

  const renderPoster = async (imageUrl: string, text: string, ratio: string) => {
    const image = new Image(); image.src = imageUrl; await image.decode();
    const widths: Record<string, number> = { '1:1': 1080, '16:9': 1280, '3:4': 900, '9:16': 900 };
    const width = widths[ratio] || 1080;
    const imageHeight = Math.round(width * image.naturalHeight / image.naturalWidth);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');
    const pad = Math.round(width * .065), textWidth = width - pad * 2;
    const titleSize = Math.round(width * .065), bodySize = Math.round(width * .05);
    const nameSize = Math.round(width * .032), footerSize = Math.round(width * .029);
    const titleHeight = titleSize * 1.35, bodyHeight = bodySize * 1.65, gap = width * .035;
    const wrap = (value: string, font: string) => {
      context.font = font;
      const lines: string[] = [];
      for (const paragraph of value.trim().split(/\n+/)) {
        let line = '';
        for (const word of paragraph.trim().split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (line && context.measureText(next).width > textWidth) { lines.push(line); line = word; }
          else line = next;
        }
        if (line) lines.push(line);
      }
      return lines;
    };
    const titleFont = `bold ${titleSize}px Tahoma, Arial, sans-serif`;
    const bodyFont = `${bodySize}px Tahoma, Arial, sans-serif`;
    const title = buildAnnouncementPoster(text, buildingName, ratio).title;
    const titleLines = wrap(title, titleFont), bodyLines = wrap(text, bodyFont);
    const captionHeight = Math.ceil(pad * 2 + nameSize + gap * 4 + titleLines.length * titleHeight + bodyLines.length * bodyHeight + footerSize);
    if (imageHeight + captionHeight > 12000) throw new Error('نص الإعلان طويل جدًا. اختصر التفاصيل لتظل واضحة في الصورة.');
    canvas.width = width; canvas.height = imageHeight + captionHeight;
    // Preserve the entire original picture and its proportions; all lettering is below it.
    context.drawImage(image, 0, 0, width, imageHeight);
    context.fillStyle = '#fbf9f3'; context.fillRect(0, imageHeight, width, captionHeight);
    context.direction = 'rtl'; context.textAlign = 'right'; context.textBaseline = 'top';
    const right = width - pad;
    let y = imageHeight + pad;
    context.fillStyle = '#55716d'; context.font = `${nameSize}px Tahoma, Arial, sans-serif`;
    context.fillText(buildingName || 'إدارة العمارة', right, y, textWidth); y += nameSize + gap;
    context.fillStyle = '#103f46'; context.font = titleFont;
    titleLines.forEach(line => { context.fillText(line, right, y, textWidth); y += titleHeight; });
    y += gap;
    context.fillStyle = '#294c50'; context.font = bodyFont;
    bodyLines.forEach(line => { context.fillText(line, right, y, textWidth); y += bodyHeight; });
    y += gap;
    context.fillStyle = '#d5dfd9'; context.fillRect(pad, y, textWidth, 2); y += gap;
    context.fillStyle = '#55716d'; context.font = `${footerSize}px Tahoma, Arial, sans-serif`;
    context.fillText('مع تحيات إدارة العمارة', right, y, textWidth);
    setGeneratedImageUrl(canvas.toDataURL('image/png')); setPrompt(text);
  };

  const handleGenerate = async (customPrompt?: string) => {
    const text = customPrompt || prompt;
    if (!text.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setIsPinned(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-announcement-image', {
        body: { prompt: text, buildingName, aspectRatio },
      });
      if (error || !data?.image) {
        let detail = typeof data?.error === 'string' ? data.error : error?.message || 'تعذر توليد الصورة بالذكاء الاصطناعي.';
        try {
          const response = (error as { context?: Response } | null)?.context;
          if (response && typeof response.json === 'function') {
            const payload = await response.json();
            if (typeof payload?.error === 'string') detail = payload.error;
          }
        } catch { /* Keep the original error. */ }
        throw new Error(detail);
      }
      await renderPoster(data.image, text, aspectRatio);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ أثناء توليد الإعلان.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePinToBoard = async () => {
    if (!generatedImageUrl) return;

    const saved = await onPinAnnouncement({
      title: buildAnnouncementPoster(prompt, buildingName, aspectRatio).title,
      content: prompt,
      date: new Date().toISOString().split('T')[0],
      type: 'general',
      imageUrl: generatedImageUrl,
      pinned: true,
    });
    if (saved) {
      setIsPinned(true);
      setTimeout(() => setIsPinned(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0f2537] via-[#1a3852] to-[#00668b] p-5 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Wand2 className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold">استوديو إعلانات ولوحات العمارة الذكي</h1>
              </div>
              <p className="text-xs text-slate-200 mt-0.5">
                تصميمات جديدة بالذكاء الاصطناعي مع الحفاظ على دقة النص العربي
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Main Two-Column Studio Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Prompting & Configuration */}
        <div className="lg:col-span-5 space-y-4">
          {/* Creation Mode Switcher */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="space-y-3.5 text-xs">
                <div>
                  <label htmlFor="announcement-text" className="block text-slate-800 font-bold mb-1.5">
                    نص الإعلان:
                  </label>
                  <textarea
                    id="announcement-text"
                    rows={4}
                    value={prompt}
                    onChange={(e) => { setPrompt(e.target.value); resetPreview(); }}
                    disabled={isGenerating}
                    placeholder="اكتب نص الإعلان الذي سيظهر للسكان..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition"
                  />
                </div>

                {/* Aspect Ratio Selector */}
                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">
                    أبعاد الصورة (الكلام يُضاف تحتها):
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '1:1 مربع', value: '1:1' },
                      { label: '16:9 شاشات', value: '16:9' },
                      { label: '3:4 ملصق', value: '3:4' },
                      { label: '9:16 ستوري', value: '9:16' },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        disabled={isGenerating}
                        aria-pressed={aspectRatio === item.value}
                        onClick={() => { setAspectRatio(item.value); resetPreview(); }}
                        className={`announcement-ratio-option py-2 px-1 text-center rounded-xl border text-[11px] font-bold transition ${
                          aspectRatio === item.value
                            ? 'bg-[#0f2537] text-white border-[#0f2537] shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Chips */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                    نماذج إعلانات جاهزة — اختر وعدّل البيانات:
                  </span>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">اختر نموذجًا، ثم عدّل البيانات بين الأقواس مثل التاريخ والوقت في نص الإعلان قبل توليد الصورة.</p>
                  <div className="space-y-1.5">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.title}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => {
                          resetPreview();
                          setPrompt(tpl.prompt);
                          setAspectRatio(tpl.aspectRatio);
                        }}
                        className="w-full text-right p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 hover:border-teal-300 transition text-xs flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">{tpl.title}</span>
                        <span dir="ltr" className="announcement-template-ratio text-[10px] bg-slate-200/80 px-2 py-0.5 rounded">
                          {tpl.aspectRatio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full bg-[#0f2537] hover:bg-[#1a3852] disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-95 text-xs"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-teal-300" />
                      <span>جارٍ توليد تصميم جديد بالذكاء الاصطناعي...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-teal-300" />
                      <span>توليد لوحة الإعلان الآن</span>
                    </>
                  )}
                </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Preview Canvas */}
        <div className="lg:col-span-7">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center min-h-[480px]">
            {generatedImageUrl ? (
              <div className="w-full flex flex-col items-center">
                <div className="relative group max-w-md w-full rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-slate-900">
                  <img
                    src={generatedImageUrl}
                    alt="Generated building poster"
                    className="w-full h-auto object-contain"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3 p-4">
                    <a
                      href={generatedImageUrl}
                      download={`bonyan-announcement-${Date.now()}.png`}
                      className="bg-white text-slate-900 px-3.5 py-2 rounded-xl font-bold text-xs shadow-lg hover:bg-slate-100 flex items-center gap-1.5 transition"
                    >
                      <Download className="w-4 h-4 text-teal-600" />
                      <span>تنزيل الصورة</span>
                    </a>
                  </div>
                </div>

                {/* Operations Bar for Generated Image */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4 w-full">
                  <button
                    onClick={handlePinToBoard}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition active:scale-95 ${
                      isPinned
                        ? 'bg-emerald-600 text-white'
                        : 'bg-teal-600 hover:bg-teal-700 text-white'
                    }`}
                  >
                    {isPinned ? <Check className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    <span>{isPinned ? 'تم النشر بلوحة الإعلانات ✓' : 'نشر على لوحة إعلانات العمارة'}</span>
                  </button>

                  <a
                    href={generatedImageUrl}
                    download={`bonyan-announcement-${Date.now()}.png`}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1.5 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>حفظ الصورة بجهازك</span>
                  </a>

               </div>
              </div>
            ) : (
              <div className="text-center p-8 max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-sm text-slate-800 mb-1">معاينة الإعلان المصمم</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  اختر أحد النصوص الجاهزة وعدّل بياناته أو اكتب إعلانك، واضغط «توليد لوحة الإعلان» لإنشاء إعلان منسق وجاهز للنشر.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
