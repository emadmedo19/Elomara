# Elomara - المنظومة الذكية لإدارة العمارات السكنية 🏢✨

> تطبيق متكامل وحديث لإدارة العمارات السكنية، الخزينة، تحصيل الاشتراكات، المصروفات، وبلاغات الصيانة مع استوديو ذكاء اصطناعي مدمج لدعم اتحادات الشاغلين وإدارات العقارات.

![Elomara Preview](https://raw.githubusercontent.com/emadmedo19/Elomara/main/public/pwa-512x512.png)

---

## 🌟 المميزات الرئيسية

- 🏢 **إدارة الوحدات والسكان**: تسجيل الشقق، أسماء الملاك والمستأجرين، وأرقام التواصل مع فلاتر سريعة للمتأخرات.
- 💰 **الخزينة والتحصيل المالي**: تسجيل ومتابعة سداد الاشتراكات الشهرية، الرصيد الفعلي، وتفاصيل المتبقي والمتأخر.
- 🧾 **توثيق المصروفات وإيصالات الصيانة**: أرشفة فواتير الصيانة الدورية والمصاعد والحراسة مع تصنيفات تفصيلية.
- 📄 **تصدير كشوف الحساب والإيصالات (PDF)**: كشف حساب مالي تفصيلي بضغطة زر مع إمكانية المشاركة المباشرة عبر واتساب.
- 🤖 **استوديو الذكاء الاصطناعي (Gemini AI Studio)**:
  - توليد إعلانات وتنبيهات مصورة وملفتة لسكان العمارة (مواعيد الصيانة، مواعيد النظافة، تنبيهات الهدوء).
  - صياغة خطابات وإشعارات رسمية لاتحاد الشاغلين باللغة العربية بأسلوب راقٍ.
- 💬 **المساعد الذكي (AI Assistant)**: استشارات فورية للإجابة عن استفسارات الميزانية، قانون اتحاد الشاغلين المصري، والحلول الإدارية.
- 📱 **تطبيق ويب تقدمي (PWA) + تطبيق أندرويد**: قابل للتثبيت السريع على الهواتف الذكية (Android و iOS) وسطح المكتب للعمل دون متصفح، مع دعم Capacitor.

---

## 🛠️ التقنيات المستخدمة (Tech Stack)

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons & Animation**: [Lucide React](https://lucide.dev/), [Motion](https://motion.dev/)
- **AI Engine**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Google Gemini)
- **Backend / Auth / DB**: Supabase + Express.js (dev server)
- **Mobile**: Capacitor 8 (Android)
- **PWA**: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)

---

## 🚀 التشغيل المحلي (Getting Started)

### 1. المتطلبات الأساسية
- تثبيت [Node.js](https://nodejs.org/) (إصدار 22.12 أو أحدث؛ تستخدم CI إصدار Node.js 22).
- مفتاح API من [Google AI Studio](https://aistudio.google.com/) لتفعيل مزايا الذكاء الاصطناعي (اختياري للتشغيل الأساسي، مطلوب للمساعد واستوديو الصور).
- مشروع Supabase (للمصادقة وقاعدة البيانات).

### 2. تثبيت الحزم
```bash
npm install
```

### 3. إعداد المتغيرات البيئية
قم بنسخ ملف `.env.example` إلى `.env`:
```bash
cp .env.example .env
```
ثم قم بتعبئة القيم:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

### 4. بدء تشغيل خادم التطوير
```bash
npm run dev
```
افتح المتصفح على: `http://localhost:3000`

### 5. البناء للإنتاج (Production Build)
```bash
npm run build
```

---

## 📁 هيكلية المشروع

```text
├── public/                 # الأيقونات والأصول وملف PWA
├── src/
│   ├── components/         # مكونات واجهة المستخدم (الخزينة، التقارير، السكان، استوديو AI، الشات)
│   ├── context/            # React Contexts
│   ├── data/               # البيانات الأولية التجريبية
│   ├── hooks/              # Custom Hooks
│   ├── lib/                # إعدادات Supabase وغيرها
│   ├── services/           # خدمات AI والمحاسبة والتخزين
│   ├── types.ts            # تعريفات TypeScript ونماذج البيانات
│   ├── App.tsx             # المكون الرئيسي
│   ├── main.tsx            # نقطة البداية
│   └── index.css           # تنسيقات Tailwind CSS والخطوط العربية
├── android/                # مشروع Capacitor Android
├── server.ts               # خادم Express وEndpoints الذكاء الاصطناعي
├── vite.config.ts          # إعدادات Vite والـ PWA
├── package.json
└── README.md
```

---

## 📄 الترخيص (License)
هذا المشروع متاح تحت رخصة MIT. يمكنك استخدامه وتطويره بحرية.

## أسلوب العمل على المستودع

الشغل والتعديلات والـ commits والـ push مباشرة على `main` فقط، بدون إنشاء فروع إضافية أو اشتراط Pull Requests. قبل البدء راجع حالة الملفات وحدّث `main` باستخدام `git pull --ff-only origin main`، واحفظ أي شغل موجود. ممنوع عمل force push على `main`.

التعليمات الكاملة في [AGENTS.md](AGENTS.md). بناء Android وتحديثات OTA يعملان من `main` فقط، حتى عند التشغيل اليدوي.

### Required deployment configuration and AI protection

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` to your project's URL and publishable key (legacy `anon`
keys are supported). Missing or invalid configuration now fails the build/start;
secret/service-role keys are rejected. Never put private keys in `VITE_*` variables.
GitHub workflows explicitly configure the existing Elomara project; override both
values using repository variables when deploying another project.

Set `GEMINI_API_KEY` only on the backend and `ALLOWED_ORIGINS` to a comma-separated
list of exact web origins, including the production web origin and
`https://localhost` for Capacitor Android. CORS is not authentication. Every
`/api/gemini/*` request requires `Authorization: Bearer <Supabase access token>`;
the backend verifies the token with Supabase and checks the account is approved,
not suspended, and assigned to a building, using the user's RLS permissions.
Receipt scanning sends this token automatically. Deploy the updated client and
backend together; older clients without bearer tokens will be rejected.

AI limits are 60 incoming requests/minute/IP, 20 requests/minute/user, and 1,000
requests/day/process. Quotas are in memory, reset on restart, and are **not a
shared spending cap**. Before scaling to multiple instances, enforce a shared
quota/rate limit at the gateway and set provider-side quotas. Proxy headers are
not trusted: behind a proxy the incoming IP limit may be shared by users.
The `gemini-chat` Supabase Edge Function used by the chat UI is now tracked under
`supabase/functions/gemini-chat/`. It verifies the user and active building profile
before calling Gemini, and enforces the same per-user and daily limits per isolate.
Its existing cross-origin support and gateway JWT verification remain enabled.
Deploy this function separately from the Express backend. Its in-memory quotas
also require a shared gateway/provider quota for a global spending cap.
Database policy migrations here must be checked against
the deployed project; unit tests do not establish production RLS correctness.

`npm test` runs the JavaScript regression tests, including AI authentication,
account restrictions, CORS, quotas and Supabase configuration. CI runs these tests,
TypeScript and the production build. OTA publishing depends on this same verification
job succeeding. SQL policy tests under `supabase/tests/` require a dedicated test
database and are not executed against production by CI.
