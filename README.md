# بُنيان (Bunyan) - المنظومة الذكية لإدارة العمارات السكنية 🏢✨

> تطبيق متكامل وحديث لإدارة العمارات السكنية، الخزينة، تحصيل الاشتراكات، المصروفات، وبلاغات الصيانة مع استوديو ذكاء اصطناعي مدمج لدعم اتحادات الشاغلين وإدارات العقارات.

![Bunyan Preview](https://raw.githubusercontent.com/username/bunyan/main/public/pwa-512x512.png)

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
- 📱 **تطبيق ويب تقدمي (PWA)**: قابل للتثبيت السريع على الهواتف الذكية (Android و iOS) وسطح المكتب للعمل دون متصفح.

---

## 🛠️ التقنيات المستخدمة (Tech Stack)

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons & Animation**: [Lucide React](https://lucide.dev/), [Motion](https://motion.dev/)
- **AI Engine**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Google Gemini Flash & Imagen)
- **Backend / Dev Server**: [Express.js](https://expressjs.com/) مع `tsx`
- **PWA**: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)

---

## 🚀 التشغيل المحلي (Getting Started)

### 1. المتطلبات الأساسية
- تثبيت [Node.js](https://nodejs.org/) (إصدار 18 أو أحدث).
- مفتاح API من [Google AI Studio](https://aistudio.google.com/) لتفعيل مزايا الذكاء الاصطناعي (اختياري للتشغيل الأساسي، مطلوب للمساعد واستوديو الصور).

### 2. تثبيت الحزم
```bash
npm install
```

### 3. إعداد المتغيرات البيئية
قم بنسخ ملف `.env.example` إلى `.env`:
```bash
cp .env.example .env
```
ثم قم بوضع مفتاح الـ API الخاص بك:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
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

## 📤 كيفية رفع المشروع إلى GitHub

### الطريقة الأولى: عبر سطر الأوامر (Terminal / Git CLI)

1. أنشئ مستودعاً جديداً (New Repository) على حسابك في GitHub (مثلاً باسم `bunyan-app`). **لا تضع علامة على Initialize with README**.
2. افتح مجلد المشروع في الـ Terminal ونفذ الأوامر التالية:

```bash
# التأكد من إعداد Git
git init

# إضافة جميع الملفات
git add .

# عمل أول Commit
git commit -m "feat: initial commit for Bunyan building management system"

# تعيين الفرع الرئيسي
git branch -M main

# ربط المستودع بمستودعك على GitHub (استبدل الرابط برابط مستودعك)
git remote add origin https://github.com/YOUR_USERNAME/bunyan-app.git

# رفع الملفات
git push -u origin main
```

---

### الطريقة الثانية: عبر تطبيق GitHub Desktop

1. حمّل وافتح تطبيق [GitHub Desktop](https://desktop.github.com/).
2. اختر **File** > **Add Local Repository** وحدد مجلد هذا المشروع.
3. اضغط على **Publish repository** لرفعه مباشرة إلى حسابك على GitHub بضغطة زر واحدة.

---

## 📁 هيكلية المشروع

```text
├── public/                 # الأيقونات والأصول وملف PWA
├── src/
│   ├── components/         # مكونات واجهة المستخدم (الخزينة، التقارير، السكان، استوديو AI، الشات)
│   ├── data/               # البيانات الأولية التجريبية (العمارات، المصروفات، الشقق)
│   ├── hooks/              # Custom Hooks (تثبيت PWA وغيرها)
│   ├── types.ts            # تعريفات TypeScript ونماذج البيانات
│   ├── App.tsx             # المكون الرئيسي وإدارة الحالة
│   ├── main.tsx            # نقطة البداية لتطبيق React
│   └── index.css           # تنسيقات Tailwind CSS والخطوط العربية
├── server.ts               # خادم Express والـ Endpoints للذكاء الاصطناعي
├── vite.config.ts          # إعدادات Vite وملف الـ PWA
├── package.json            # الاعتماديات وأوامر التشغيل
└── README.md               # دليل التوثيق والتشغيل
```

---

## 📄 الترخيص (License)
هذا المشروع متاح تحت رخصة MIT. يمكنك استخدامه وتطويره بحرية.
