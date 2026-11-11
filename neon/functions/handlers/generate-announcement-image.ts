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
  // Pollinations is opt-in: never use a key that might spend paid Pollen without explicit configuration.
  const pollinationsKey = process.env["POLLINATIONS_API_KEY"]?.trim();
  const pollinationsFreeOnly = process.env["POLLINATIONS_FREE_ONLY"] === "true";
  if (!key && !(pollinationsKey && pollinationsFreeOnly)) return Response.json({ error: "خدمة توليد الصور غير مهيأة بعد." }, { status: 503, headers: cors });
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
  const theme = /مصعد|اسانسير|أسانسير/.test(prompt) ? 'a modern residential elevator, closed brushed-metal doors and tasteful maintenance equipment'
    : /مياه|صنابير/.test(prompt) ? 'clear water droplets, elegant blue plumbing pipes and a residential water tank'
    : /كهرباء|التيار/.test(prompt) ? 'a modern electrical panel, cables and a warm glowing light bulb, safe and orderly'
    : /نظافة|القمامة/.test(prompt) ? 'a spotless elegant residential entrance, green plants and discreet cleaning equipment'
    : /جراج|سيارة|السيارات/.test(prompt) ? 'an organized residential garage with neatly parked cars and clear access lanes'
    : /اجتماع|الملاك/.test(prompt) ? 'a welcoming residential meeting area with a round table and neatly arranged chairs'
    : /اشتراك|سداد/.test(prompt) ? 'a well-maintained residential building entrance with subtle payment and service motifs, no banknotes or numerals'
    : /هدوء|الأصوات/.test(prompt) ? 'a peaceful residential building at dusk, soft window lights, serene atmosphere'
    : 'an elegant contemporary residential building entrance';
  const visualPrompt = `Design an elegant illustrated background for a residential community announcement in Egypt. Main visual: ${theme}. Notice context (reference only, never render as text): ${prompt}. Use a cohesive premium 3D editorial illustration, navy and deep teal with restrained warm gold accents, soft cinematic lighting, realistic architectural detail. One clear focal subject, generous negative space, no collage or clutter. Compose the illustrative subject in the upper 18% and supporting objects near the outer edges; keep the rectangle from x=7% to 93%, y=20% to 83% dark, calm and unobstructed for the app's Arabic heading and short body text. Background must fill the entire ${aspectRatio} canvas, with no borders, letterboxing or blank white margins. Absolutely NO text, letters, digits, logos, watermarks, signs or typography anywhere. Do not draw an empty notice board or an inner poster. Create a fresh composition.`;

  const tryPollinations = async (): Promise<string | null> => {
    if (!pollinationsKey || !pollinationsFreeOnly) return null;
    // A restricted key with no paid Pollen must be configured by the owner before enabling.
    const response = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${pollinationsKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: "black-forest-labs/flux.1-schnell", prompt: visualPrompt, size: ({ "1:1": "1024x1024", "16:9": "1280x720", "3:4": "768x1024", "9:16": "720x1280" } as Record<string, string>)[aspectRatio], response_format: "b64_json", n: 1 }),
    });
    if (!response.ok) {
      console.warn("[AI poster] Pollinations unavailable", { status: response.status });
      return null;
    }
    const result = await response.json();
    const base64 = result?.data?.[0]?.b64_json;
    if (typeof base64 === "string" && base64.length > 100) return `data:image/png;base64,${base64}`;
    const url = result?.data?.[0]?.url;
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      const imageResponse = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (imageResponse.ok && (imageResponse.headers.get("content-type") || "").startsWith("image/")) {
        const bytes = new Uint8Array(await imageResponse.arrayBuffer());
        if (bytes.length > 8_000_000) return null;
        let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
        return `data:${imageResponse.headers.get("content-type")};base64,${btoa(binary)}`;
      }
    }
    return null;
  };
  try {
    if (!key) {
      const image = await tryPollinations();
      return image ? Response.json({ image, provider: "pollinations" }, { headers: cors }) : Response.json({ error: "محرك الصور البديل غير متاح حاليًا." }, { status: 503, headers: cors });
    }
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
      const error = response.status === 429 ? (pollinationsKey && pollinationsFreeOnly ? 'حصة Google غير متاحة، وتعذر التوليد بالمزوّد البديل حاليًا. حاول لاحقًا.' : 'حصة توليد الصور في Google غير متاحة، والمزوّد البديل لم يُفعّل على الخادم بعد.')
        : response.status === 403 || response.status === 401 ? 'مفتاح Gemini غير مصرح له بتوليد الصور. راجع صلاحيات المفتاح.'
        : response.status === 404 ? 'نموذج توليد الصور غير متاح للمشروع الحالي.'
        : response.status === 400 ? 'خدمة Gemini رفضت إعدادات طلب الصورة.'
        : response.status >= 500 ? 'خدمة Gemini غير متاحة مؤقتًا.'
        : 'تعذر توليد الصورة حاليًا.';
      if ([429, 403, 404, 500, 502, 503].includes(response.status)) { const image = await tryPollinations(); if (image) return Response.json({ image, provider: "pollinations" }, { headers: cors }); }
      return Response.json({ error, code: providerCode || `HTTP_${response.status}` }, { status: response.status === 429 ? 429 : 502, headers: cors });
    }
    const part = result?.candidates?.[0]?.content?.parts?.find((item: { inlineData?: { data?: string; mimeType?: string } }) => item.inlineData?.data && item.inlineData?.mimeType?.startsWith("image/"));
    if (!part?.inlineData?.data) { console.error("[AI poster] Gemini returned no image", { finishReason: result?.candidates?.[0]?.finishReason || "unknown" }); return Response.json({ error: "خدمة Gemini لم تُرجع صورة. جرّب وصفًا مختلفًا." }, { status: 502, headers: cors }); }
    return Response.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, provider: "gemini" }, { headers: cors });
  } catch (error) {
    console.error("[AI poster] Request failed", { type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "تعذر الاتصال بخدمة توليد الصور. حاول مجددًا." }, { status: 503, headers: cors });
  }
}
