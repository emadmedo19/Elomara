import { translatePosterContext } from "../poster-scene";
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
  const aspectRatio = typeof payload.aspectRatio === "string" && ["1:1", "16:9", "3:4", "9:16"].includes(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  if (prompt.length < 10) return Response.json({ error: "اكتب تفاصيل الإعلان أولاً." }, { status: 400, headers: cors });
  let theme: string;
  let workScene = false;
  // The main purpose wins over services merely mentioned inside the notice.
  if (/اجتماع|جمعية|لقاء السكان/.test(prompt)) {
    theme = 'adult residents and homeowners having a friendly community meeting around a table, diverse everyday civilian clothing, relaxed discussion, ordinary residential surroundings; no uniforms, tools or maintenance crew';
  } else if (/اشتراك|سداد|تحصيل/.test(prompt)) {
    theme = 'a well-maintained residential building entrance with subtle payment and service motifs, no banknotes or numerals; if people appear, they are residents in everyday civilian clothes, not a maintenance crew';
  } else if (/هدوء|الأصوات|ضوضاء/.test(prompt)) {
    theme = 'a peaceful residential building at dusk, soft window lights, a calm neighborhood and serene atmosphere, no work crew';
  } else if (/جراج|سيارة|السيارات/.test(prompt) && !/صيانة|إصلاح|اصلاح|تصليح/.test(prompt)) {
    theme = 'an organized residential garage with neatly parked cars and clear access lanes, reflecting the parking instructions, no work crew';
  } else if (/نظافة|القمامة|تنظيف/.test(prompt)) {
    theme = 'cleaning staff actively mopping and polishing a beautiful residential entrance, cleaning trolley, green plants and daylight';
    workScene = true;
  } else if (/صيانة|إصلاح|اصلاح|تصليح/.test(prompt)) {
    workScene = true;
    theme = /مصعد|اسانسير|أسانسير/.test(prompt)
      ? 'two professional elevator technicians actively inspecting and servicing a residential elevator, one using tools at the control cabinet, realistic uniforms and safety equipment'
      : /مياه|صنابير|سباكة/.test(prompt)
      ? 'professional plumbers actively repairing water pipes beside a residential water tank, realistic hand tools and clean work uniforms'
      : /كهرباء|التيار/.test(prompt)
      ? 'qualified electricians actively servicing a safely isolated electrical panel in a residential building, insulated tools, protective gloves and work uniforms'
      : 'skilled maintenance workers actively carrying out the specific repair described in the notice, relevant tools and appropriate safety equipment';
  } else {
    try { if (!key) throw new Error("تعذر تجهيز وصف مخصص للصورة حاليًا. اختر أحد النماذج الجاهزة أو حاول لاحقًا."); theme = await translatePosterContext(prompt, key); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'تعذر تجهيز وصف الصورة.' }, { status: 503, headers: cors }); }
  }
  const styling = workScene
    ? 'Show the specified work in progress with authentic tools, natural poses, suitable work clothing and appropriate safety equipment.'
    : 'Match the mood, objects and any people to the actual notice. People, if relevant, wear ordinary everyday civilian clothing. Do not turn this into a maintenance scene.';
  const visualPrompt = `Create a premium FRIENDLY 3D CARTOON ILLUSTRATION for an Egyptian residential building announcement. Scene: ${theme}. ${styling} Art direction: polished animated-feature-quality 3D cartoon, charming expressive adult characters with rounded stylized faces, friendly eyes and natural poses, detailed dimensional environments, smooth premium materials, soft cinematic daylight, rich teal and cheerful orange accents, warm architectural surfaces and lush green plants. Beautiful ambient lighting, depth and gentle shadows. People are clearly stylized cartoon adults, NOT realistic photographic humans, NOT flat vector artwork, NOT an isometric miniature or dollhouse. Keep people and clothing specific to the notice subject. Compose a complete attractive scene filling the entire ${aspectRatio} canvas edge to edge, with the full subjects visible and balanced composition. This image is ONLY an illustration: all announcement text will be rendered separately BELOW the image, so do not reserve empty space for text. Absolutely NO text, letters, numbers, pseudo-lettering, logos, captions, watermarks, notice boards, posters, signs, calendars, menus, receipt lettering or framed panels. Use plain unmarked tools and objects. Do not include any surfaces intended for writing. Create a fresh beautiful coherent scene.`;
  const finishImage = (image: string, provider: string) => Response.json({ image, provider }, { headers: cors });
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
      return image ? finishImage(image, 'pollinations') : Response.json({ error: 'محرك الصور البديل غير متاح حاليًا.' }, { status: 503, headers: cors });
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
      if ([429, 403, 404, 500, 502, 503].includes(response.status)) { const image = await tryPollinations(); if (image) return finishImage(image, "pollinations"); }
      return Response.json({ error, code: providerCode || `HTTP_${response.status}` }, { status: response.status === 429 ? 429 : 502, headers: cors });
    }
    const part = result?.candidates?.[0]?.content?.parts?.find((item: { inlineData?: { data?: string; mimeType?: string } }) => item.inlineData?.data && item.inlineData?.mimeType?.startsWith("image/"));
    if (!part?.inlineData?.data) { console.error("[AI poster] Gemini returned no image", { finishReason: result?.candidates?.[0]?.finishReason || "unknown" }); return Response.json({ error: "خدمة Gemini لم تُرجع صورة. جرّب وصفًا مختلفًا." }, { status: 502, headers: cors }); }
    return finishImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, "gemini");
  } catch (error) {
    console.error("[AI poster] Request failed", { type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "تعذر الاتصال بخدمة توليد الصور. حاول مجددًا." }, { status: 503, headers: cors });
  }
}
