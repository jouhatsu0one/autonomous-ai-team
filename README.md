# Autonomous AI Engineering Team

نسخة تطوير أولية لإدارة إصلاحات GitHub من Cloudflare. النشر الحي موقوف إلى حين التحقق من الخطط المجانية وتهيئة الاتصالات.

## التشغيل المحلي

يتطلب Node.js 24. نفّذ الأوامر من جذر المشروع.

```sh
npm ci
npm run check
npm test
npm run schema:local
npm run dev
```

انسخ `.dev.vars.example` إلى `.dev.vars` وضع قيمة محلية عشوائية لـ `ADMIN_TOKEN` بطول 32 حرفاً على الأقل. شغّل الواجهة في نافذة أخرى.

```sh
npx --no-install vite dashboard --host 127.0.0.1
```

افتح `http://localhost:5173`. عنوان Worker المحلي هو `http://localhost:8787`. لتغييرهما، اضبط `DASHBOARD_ORIGIN` في Wrangler و`VITE_API_URL` أثناء بناء الواجهة. يبقى رمز الإدارة في ذاكرة الصفحة حتى إعادة تحميلها. يختبر `GET /api/health` الوصول إلى جدول المهام ويعرض حالة مفتاح تفعيل الاستدعاءات.

## تهيئة الإنتاج

1. تحقق في لوحات الحسابات من Workers Free ومن المشاريع المجانية لدى Groq وGoogle AI Studio. راجع استهلاك الحسابات المشتركة. عطّل Unified Billing وشراء الرصيد في AI Gateway، وعطّل تسجيل نص المدخلات والمخرجات من إعداداته. Google AI Studio قد يستخدم بيانات الخطة المجانية لتحسين خدماته. خصص مستودعاً عاماً يُسمح بإرسال محتواه لهذه الخدمات.
2. أنشئ الموارد بعد التحقق. ضع معرّف D1 في `wrangler.toml`. أنشئ Gateway باسم `ai-team-gateway` ثم اضبط متغيرات الحساب والمستودع وأصل Pages في الملف. تظهر أسماء الموارد في الإعدادات.

   ```sh
   npx wrangler d1 create ai_engine_d1
   npx wrangler queues create ai-fix-queue
   npx wrangler queues create ai-fix-dead-letter
   npx wrangler pages project create autonomous-ai-team --production-branch main
   ```

3. أنشئ GitHub App للمستودع المصرح به فقط. اضبط صلاحيات Issues للقراءة وMetadata للقراءة وContents وPull requests للقراءة والكتابة. فعّل حدث Issues ووجّه Webhook إلى `https://<worker>/webhooks/github`. ثبّت التطبيق في المستودع المخصص وسجّل معرّف التثبيت في `wrangler.toml`. استخدم مفتاحاً بصيغة PKCS#8 لأن Web Crypto يستورده مباشرة.

   ```sh
   openssl pkcs8 -topk8 -nocrypt -in github-app.pem -out github-app.pkcs8.pem
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY < github-app.pkcs8.pem
   ```

4. أضف بقية الأسرار من `.dev.vars.example` عبر `wrangler secret put`. استخدم `openssl rand -base64 32` لإنشاء مفاتيح الإدارة والتوقيع والتشفير، بقيمة مستقلة لكل واحد. يطلب `WORKERS_AI_API_TOKEN` صلاحية Workers AI اللازمة فقط، ويستخدم `AI_GATEWAY_TOKEN` لمصادقة Gateway. اختبر مفاتيح المزودين في مشاريعهم المجانية قبل تغيير `FREE_PROVIDERS_VERIFIED` إلى `true`.
5. اربط المستودع العام ببيئة GitHub Actions المسماة `production`. أضف سر `CLOUDFLARE_API_TOKEN` والمتغيرات `CLOUDFLARE_ACCOUNT_ID` و`WORKER_URL`. فعّل `FREE_DEPLOY_VERIFIED=true` بعد التحقق من الخطة والموارد والأذونات. احمِ `main` بفحص `verify` ومراجعة بشرية إلزامية، ومنع تجاوز الحماية وعمليات force push. يفتح التطبيق مسودة فقط. تفعيل auto-merge وإعداد قواعد الفرع إجراءان على GitHub.
6. افتح Issue تجريبياً في المستودع المصرّح به. أضف `ai-security-review` لاختبار المراجعة، أو `ai-fix` لتوليد مقترح. يتحقق العامل من صلاحية الشخص الذي وضع التصنيف. افحص الحالة وReplay وسجل الاستهلاك. لا تفعل أي مسار مدفوع.

## بوابة الاختبارات ونشر Draft PR

عندما تصل المهمة إلى `awaiting-validation`، شغّل المدقق على جهاز Linux موثوق أو GitHub Actions لمستودع عام معزول. يتطلب Git وDocker وOSV-Scanner v2 وصورة اختبار تثق بها ومحددة ببصمة SHA-256. جهّز الصورة من المصدر الموثوق، وضع تبعيات الاختبار داخلها من ملفات قفل معلومة، واجعل نقطة الدخول تفحص `/candidate` وتعيد حالة الخروج الفعلية. لا تضع مفاتيح داخل الصورة. يرفض المدقق تعديل ملفات الاعتماديات والاختبار والإعدادات ويفحص الاعتماديات الموجودة قبل تشغيل الحاوية. يتوقف عند أي نتيجة غير ناجحة من OSV-Scanner.

```sh
node scripts/validate-and-publish.mjs <task-id>
```

يقرأ المدقق `AI_TEAM_WORKER_URL` و`AI_TEAM_ADMIN_TOKEN` و`AI_TEAM_VALIDATION_SECRET` و`AI_TEAM_VALIDATOR_IMAGE` من متغيرات البيئة. يعمل الكود المرشح في حاوية بلا شبكة وبملفات مصدر للقراءة فقط، خارج عملية توقيع الإيصال. يتحقق Worker من بصمة المقترح والـ commit الأساسي والتوقيع ومدة الصلاحية قبل فتح Draft PR. عند تحرك الفرع الأساسي يلزم توليد مقترح جديد. المدقق أمر مستقل ولم يُربط بتشغيل تلقائي.

## الاستهلاك والتعافي

حدود المشروع اليومية 12 مهمة و25 رسالة و12 محاولة نشر، مع حجز تقديري مسبق يصل إلى 7,500 Neurons و75 محاولة Groq و50 محاولة Google. هذه سقوف داخل التطبيق. قيود المعدل والحصص الفعلية تحددها خطط الحسابات. يعرض سجل الاستهلاك عدد الرموز عند إرجاعه من المزود ويسجل المحاولات الفاشلة. قيمة الدولار صفر افتراضياً بناءً على تهيئة الخطط المجانية. راجع لوحة المزود للتحقق من الاستهلاك الفعلي. عند اقتراب الحصة أو تغير شروط الخطة، عطّل `FREE_PROVIDERS_VERIFIED` وأعد التحقق من الحسابات. تعتمد المنصة على UTC لتجديد السقوف اليومية.

راجع `REPORT.md` لمعرفة نطاق التنفيذ وما يلزم لاستكمال النشر.
