import { createBackendClient } from "../database.mjs";

const cors = { "Access-Control-Allow-Origin": "https://localhost", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const limits = new Map<string, number[]>();
export default async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/i.test(authorization)) return Response.json({ error: "يرجى تسجيل الدخول أولاً." }, { status: 401, headers: cors });
  const client = createBackendClient(authorization);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return Response.json({ error: "جلسة الدخول غير صالحة." }, { status: 401, headers: cors });
  const { data: profile, error: profileError } = await createBackendClient().from("profiles")
    .select("role,approved,disabled_at,building_id").eq("id", user.id).maybeSingle();
  if (profileError) return Response.json({ error: "تعذر التحقق من الصلاحيات." }, { status: 503, headers: cors });
  if (!profile?.approved || profile.disabled_at || !profile.building_id || profile.role !== "building_admin")
    return Response.json({ error: "توليد لوحات الإعلانات متاح لمدير العمارة فقط." }, { status: 403, headers: cors });
  const key = process.env["GEMINI_API_KEY"]?.trim();
  if (!key) return Response.json({ error: "خدمة توليد الصور غير مهيأة بعد." }, { status: 503, headers: cors });
  const now = Date.now();
  const recent = (limits.get(user.id) || []).filter(time => now - time < 3600000);
  if (recent.length >= 10) return Response.json({ error: "وصلت للحد المؤقت للتوليد. حاول بعد قليل." }, { status: 429, headers: cors });
  recent.push(now); limits.set(user.id, recent);
  let payload: { prompt?: unknown; aspectRatio?: unknown; buildingName?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "طلب غير صالح." }, { status: 400, headers: cors }); }
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim().slice(0, 2500) : "";
  const buildingName = typeof payload.buildingName === "string" ? payload.buildingName.trim().slice(0, 100) : "";
  const aspectRatio = typeof payload.aspectRatio === "string" && ["1:1", "16:9", "3:4", "9:16"].includes(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  if (prompt.length < 10) return Response.json({ error: "اكتب تفاصيل الإعلان أولاً." }, { status: 400, headers: cors });
  const visualPrompt = `Create a PREMIUM professional visual background for a residential building notice poster in Egypt. Subject: ${prompt}. Building context: ${buildingName}. Editorial-quality architectural illustration, polished realistic 3D scene, tasteful modern navy, teal and gold, premium art direction, carefully balanced visual hierarchy. IMPORTANT: absolutely NO text, letters, digits, logos, symbols resembling text, watermarks or typography anywhere. Keep the central 60% relatively calm, dark and uncluttered so precise Arabic text can be overlaid later by the app. Place thematic illustrative objects primarily near the edges. Make a genuinely new composition for this request. Aspect ratio ${aspectRatio}.`;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" + encodeURIComponent(key), {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ contents: [{ parts: [{ text: visualPrompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerCode = String(result?.error?.status || '');
      const providerMessage = String(result?.error?.message || '').slice(0, 180);
      console.error('[AI poster] Gemini request failed', { httpStatus: response.status, providerCode, providerMessage });
      const error = response.status === 429 ? 'تم الوصول لحد استخدام Gemini. حاول لاحقًا.'
        : response.status === 403 || response.status === 401 ? 'مفتاح Gemini غير مصرح له بتوليد الصور. راجع صلاحيات المفتاح.'
        : response.status === 404 ? 'نموذج توليد الصور غير متاح للمشروع الحالي.'
        : response.status === 400 ? 'خدمة Gemini رفضت إعدادات طلب الصورة.'
        : response.status >= 500 ? 'خدمة Gemini غير متاحة مؤقتًا.'
        : 'تعذر توليد الصورة حاليًا.';
      return Response.json({ error, code: providerCode || `HTTP_${response.status}` }, { status: response.status === 429 ? 429 : 502, headers: cors });
    }
    const part = result?.candidates?.[0]?.content?.parts?.find((item: { inlineData?: { data?: string; mimeType?: string } }) => item.inlineData?.data && item.inlineData?.mimeType?.startsWith("image/"));
    if (!part?.inlineData?.data) { console.error("[AI poster] Gemini returned no image", { finishReason: result?.candidates?.[0]?.finishReason || "unknown" }); return Response.json({ error: "خدمة Gemini لم تُرجع صورة. جرّب وصفًا مختلفًا." }, { status: 502, headers: cors }); }
    return Response.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }, { headers: cors });
  } catch (error) {
    console.error("[AI poster] Request failed", { type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "تعذر الاتصال بخدمة توليد الصور. حاول مجددًا." }, { status: 503, headers: cors });
  }
}
