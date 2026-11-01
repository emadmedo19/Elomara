import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { 
  Download, Smartphone, Check, ExternalLink, X, 
  ShieldCheck, ArrowRight, Copy, Sparkles, Layers,
  FolderDown, Github, Terminal, FileCode2
} from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  appUrl,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'apk' | 'github'>('github');

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(appUrl || window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 text-slate-800 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] overflow-y-auto">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-700 flex items-center justify-center">
              <FolderDown className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">تنزيل المشروع ورفعه على GitHub</h2>
              <p className="text-xs text-slate-500">تحميل الكود المصدري كاملاً (ZIP) مستقلاً تماماً</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option Tabs */}
        <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-2xl mb-4 text-[11px] font-bold gap-1">
          <button
            onClick={() => setActiveTab('github')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'github'
                ? 'bg-[#0f2537] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>كود ZIP لـ GitHub</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'pwa'
                ? 'bg-[#0f2537] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📱</span>
            <span>تثبيت PWA</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'apk'
                ? 'bg-[#0f2537] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📦</span>
            <span>ملف APK</span>
          </button>
        </div>

        {activeTab === 'github' ? (
          <div className="space-y-4 text-xs">
            {/* Direct ZIP Download Box */}
            <div className="bg-gradient-to-br from-teal-50 via-sky-50 to-emerald-50 p-4 rounded-2xl border border-teal-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                    <FolderDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">حزمة المشروع الكاملة (Standalone ZIP)</h3>
                    <p className="text-[11px] text-slate-500">مستقل 100% بدون أي ارتباط أو قيود بالمنصة</p>
                  </div>
                </div>
                <span className="text-[10px] bg-teal-600/10 text-teal-700 px-2.5 py-1 rounded-full font-bold border border-teal-500/20">
                  ~6.9 ميجابايت
                </span>
              </div>

              <p className="text-slate-600 leading-relaxed text-[11px]">
                يحتوي هذا الأرشيف على كل ملفات الكود المصدري (React 19 + TypeScript + Tailwind v4 + Express + Vite + PWA + ملف التوثيق README.md كاملاً) جاهزاً للعمل على جهازك فوراً.
              </p>

              {/* Direct Download Button */}
              <a
                href="/bunyan-source-code.zip"
                download="bunyan-source-code.zip"
                className="w-full bg-gradient-to-r from-teal-600 to-[#00668b] hover:from-teal-500 hover:to-[#007ea8] text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-teal-900/20 transition active:scale-95 flex items-center justify-center gap-2 text-sm text-center"
              >
                <FolderDown className="w-4 h-4" />
                <span>تحميل ملف الكود المضغوط الآن (ZIP)</span>
              </a>
            </div>

            {/* Step-by-Step GitHub Upload Guide */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <Github className="w-4 h-4 text-slate-700" />
                <span>خطوات رفع الملف على حسابك في GitHub (مستقل تماماً):</span>
              </h4>

              <div className="space-y-2.5 text-[11px] text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-slate-800 block">فك ضغط الملف على جهازك:</strong>
                    <span>فك ضغط ملف <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">bunyan-source-code.zip</code> في أي مجلد تريده.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-slate-800 block">إنشاء مستودع جديد على GitHub:</strong>
                    <span>ادخل على <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline font-bold">github.com/new</a> وأنشئ مستودعاً باسم <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">bunyan-app</code>.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                    3
                  </span>
                  <div className="w-full">
                    <strong className="text-slate-800 block">الرفع عبر سحب الملفات أو الـ Terminal:</strong>
                    <p className="mb-1.5">
                      • <strong>طريقة السحب والإفلات (بدون أوامر):</strong> في صفحة المستودع على GitHub اضغط على <em>uploading an existing file</em> واسحب كل الملفات وضعها هناك واضغط Commit!
                    </p>
                    <p>
                      • <strong>أو عبر سطر الأوامر (Git CLI):</strong>
                    </p>
                    <div className="bg-[#0f2537] text-teal-300 p-2.5 rounded-xl font-mono text-[10px] leading-relaxed my-1.5 ltr text-left overflow-x-auto" dir="ltr">
                      git init<br />
                      git add .<br />
                      git commit -m "Initial commit for Bunyan"<br />
                      git branch -M main<br />
                      git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git<br />
                      git push -u origin main
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1 border-t border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                    ✓
                  </span>
                  <div>
                    <strong className="text-emerald-700 block">لتشغيل المشروع محلياً على جهازك في أي وقت:</strong>
                    <div className="bg-slate-100 p-1.5 rounded-lg font-mono text-[10px] ltr text-left mt-1 text-slate-800" dir="ltr">
                      npm install<br />
                      npm run dev
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'pwa' ? (
          <div className="space-y-4 text-xs">
            {/* PWA Direct Installation Card */}
            <div className="bg-gradient-to-br from-teal-50 to-indigo-50/50 p-4 rounded-2xl border border-teal-200">
              <div className="flex items-center gap-2 mb-2 text-teal-800 font-bold">
                <Check className="w-4 h-4 text-teal-600" />
                <span>تثبيت فوري بدون متجر جوجل بلاي</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px] mb-3">
                تم تجهيز التطبيق بملف Manifest وأيقونات عالية الدقة وخدمة العمل بدون إنترنت (PWA). ستحصل على تطبيق بأيقونة على شاشتك الرئيسية ويعمل بملء الشاشة وبسرعة فائقة.
              </p>

              {isInstalled ? (
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>التطبيق مثبت بالفعل ويعمل كـ Standalone App!</span>
                </div>
              ) : isInstallable ? (
                <button
                  onClick={async () => {
                    const ok = await install();
                    if (ok) onClose();
                  }}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>تثبيت التطبيق على جهازي الآن</span>
                </button>
              ) : isIOS ? (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 text-slate-700">
                  <span className="font-bold block text-slate-900">طريقة التثبيت على iPhone / Safari:</span>
                  <p>1. اضغط على زر <strong>المشاركة (Share)</strong> أسفل شاشة سفاري.</p>
                  <p>2. اختر <strong>«إضافة إلى الصفحة الرئيسية» (Add to Home Screen)</strong>.</p>
                </div>
              ) : (
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                  💡 لتثبيته من متصفح Chrome على الأندرويد: اضغط على القائمة (الثلاث نقاط) أعلى المتصفح واختر <strong>«تثبيت التطبيق» (Install app)</strong> أو <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800 block">مميزات التطبيق المثبت على الهاتف:</span>
              <p>✓ يعمل بدون شريط المتصفح كأنه تطبيق Android أصلي.</p>
              <p>✓ أيقونة مخصصة واسم «برج الفتوح» على شاشة هاتفك.</p>
              <p>✓ تخزين مؤقت للبيانات وسرعة فتح فورية.</p>
            </div>
          </div>
        ) : (
          /* APK Generation Guide */
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <span className="w-6 h-6 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-xs">
                  1
                </span>
                <span>انسخ رابط تطبيق برج الفتوح:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={appUrl || window.location.href}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'تم' : 'نسخ'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-slate-900 font-bold pt-2">
                <span className="w-6 h-6 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-xs">
                  2
                </span>
                <span>افتح أداة PWABuilder (الأداة الرسمية لتوليد ملفات APK):</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed pr-8">
                أداة مجانية مفتوحة المصدر من مايكروسوفت ومعتمدة من جوجل تقوم بفحص الـ Manifest والأيقونات وتوليد ملف APK جاهز للتثبيت أو ملف AAB لمتجر Google Play في ثوانٍ.
              </p>
              <div className="pr-8">
                <a
                  href={`https://www.pwabuilder.com/?site=${encodeURIComponent(appUrl || window.location.origin)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#0f2537] hover:bg-[#1a3852] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md transition"
                >
                  <span>فتح PWABuilder وتحميل APK</span>
                  <ExternalLink className="w-3.5 h-3.5 text-teal-300" />
                </a>
              </div>

              <div className="flex items-center gap-2 text-slate-900 font-bold pt-2">
                <span className="w-6 h-6 rounded-full bg-[#0f2537] text-white flex items-center justify-center text-xs">
                  3
                </span>
                <span>الضغط على "Package for Android":</span>
              </div>
              <p className="text-slate-600 text-[11px] pr-8">
                سيتم تنزيل حزمة الـ APK مباشرة لجهازك لتثبيته كملف `.apk` في هاتفك أو إرساله عبر البلوتوث/واتساب.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
