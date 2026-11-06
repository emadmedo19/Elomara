# بُنيان (Bunyan) - المنظومة الذكية لإدارة العمارات السكنية 🏢✨

> تطبيق متكامل وحديث لإدارة العمارات السكنية، الخزينة، تحصيل الاشتراكات، المصروفات، وبلاغات الصيانة مع استوديو ذكاء اصطناعي مدمج لدعم اتحادات الشاغلين وإدارات العقارات.

![Bunyan Preview](https://raw.githubusercontent.com/emadmedo19/Elomara/main/public/pwa-512x512.png)

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
- تثبيت [Node.js](https://nodejs.org/) (إصدار 18 أو أحدث).
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
