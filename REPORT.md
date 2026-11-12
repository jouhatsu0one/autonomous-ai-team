# تقرير Autonomous AI Engineering Team

**الحالة في 12 نوفمبر 2026**
بُنيت نسخة تطوير واختُبرت محلياً. لم تُنشأ موارد إنتاج، ولم يُرفع المستودع أو تُفتح مسودة حية. لا يوجد رابط نشر أو نماذج مفعّلة في حساب إنتاج.

## ما يتضمنه المشروع

| المكوّن | الحالة |
|---|---|
| استقبال GitHub | توقيع HMAC على الجسم الخام، حد حجم، مستودع عام وتثبيت محددان، طابور، وقبول محدود مع منع التكرار |
| المعالجة | Workflows وDurable Objects، الوكلاء الخمسة، قاضٍ مستقل، محاولتان إضافيتان، ومساران من flows.yaml |
| سياق المستودع | اختيار ما يصل إلى خمسة ملفات مصدر مكتملة وصغيرة، روابط imports محلية، واسترجاع ثلاثة أنماط عند توفرها في D1 |
| الحوكمة | سجل قرارات، دفتر استهلاك، استرجاع مدخلات ومخرجات خطوات النماذج في Replay |
| الواجهة | React وVite، دردشة محفوظة في D1 مع سياق المهمة، لوحة أوامر، صفحة اتصالات، وتخزين مشفر لرمز Cloudflare بعد التحقق |
| نشر مسودة | مدقق خارجي يتطلب صورة اختبار موثوقة وOSV-Scanner. واجهة Worker تقبل إيصالاً موقعاً مرتبطاً ببصمة المقترح والـ commit |
| التطوير الذاتي | Cron كل ست ساعات ومقترحات في D1. اختبارات الانحدار وA/B والموافقة وRollback لم تُنفّذ كحلقة تلقائية |
| التسليم المستمر | GitHub Actions للفحص والنشر إلى Workers وPages عند تفعيل التهيئة في مستودع عام |

## النماذج المضبوطة في الكود

| الدور | نموذج Workers AI |
|---|---|
| Architect | GPT-OSS 120B |
| Developer | Qwen 2.5 Coder 32B |
| Security | GLM 4.7 Flash |
| Reviewer | Gemma 4 26B |
| Meta-Improver | Granite 4.0 H Micro |
| Judge | GPT-OSS 20B |
| Quick | Llama 3.1 8B Instruct FP8 Fast |

التوجيه الاحتياطي في التطبيق يمر عبر AI Gateway إلى Groq Llama 3.3 70B ثم Gemini 2.5 Flash-Lite باستخدام مفاتيح المزودين. القاضي يتوقف إذا تعذر نموذجه المستقل. يلزم اختبار الاستدعاءات الحية وتوفر النماذج وحصصها في الحسابات المستهدفة. النماذج الأربعة التي طلبت في البداية تتطلب اشتراكاً مدفوعاً أو رصيداً مسبق الدفع حسب وثائق Cloudflare.

## التحقق المحلي

- اجتازت النسخة فحص TypeScript و6 اختبارات آلية، وبناء Vite، وفحص حزمة Wrangler دون نشر، وتطبيق مخطط D1 محلياً.
- اجتاز اختبار التشغيل المحلي مسارات Health والمصادقة وCORS وتوقيع Webhook، وإرسال الطلب إلى Queue، ومنع التكرار، وتسجيل فشل Workflow لغياب بيانات GitHub، وReplay. وأعاد مسار النشر رفضاً عند غياب سر المدقق.
- لم تستخدم الاختبارات مفاتيح مزودين أو GitHub App حياً. أزمنة الاستجابة المحلية لا تقيس CPU في Cloudflare.

## ما يتبقى

- تأكيد خطة حساب Cloudflare من لوحة الحساب. صلاحية الاتصال المستخدمة أعادت 403 عند طلب اشتراكات الحساب. يلزم إنشاء المستودع العام وتثبيت GitHub App والتحقق من مفاتيح المزودين وإعداد حماية الفرع.
- قياس CPU على Worker منشور للتحقق من هدف 5ms. قياس هدف الأداء والتحقق من الاستهلاك الفعلي واختبار Issue إلى Draft PR لا يزال معلقاً.
- إعداد صورة مدقق خاصة بالمستودع وتجربتها. بيئة Cloudflare Sandboxes تتطلب Workers Paid. المدقق الخارجي يحتاج Docker، ويعزل الاختبارات بلا egress. لم يُشغّل Docker أو OSV في هذه البيئة.
- Vectorize والفهرسة الدلالية لكامل المستودع وتعبئة ذاكرة الحلول من نتائج الدمج غير مكتملة.
- GitHub OAuth وMCP/A2A وAIChatAgent وVercel AI SDK وAI Elements وshadcn/ui وTailwind والتوجيه الديناميكي في إعدادات Gateway غير مكتملة. الواجهة الحالية تستخدم REST وCSS وتعرض رد الوكيل النصي، مع ربط GitHub App عبر بيانات التثبيت.
- بوابة Regression/A/B/Merge/Rollback للتطوير الذاتي والإشعارات الخارجية غير مفعلة. تتوقف مقترحات Meta-Improver عند الحفظ.

## مراجع

- [تسعير Workers AI والنماذج التي تتطلب الدفع](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [إيقاف نماذج في 20 نوفمبر 2026](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/)
- [Cloudflare Sandboxes](https://developers.cloudflare.com/sandbox/)
- [AI Gateway وUnified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)
- [حماية الفروع في GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
