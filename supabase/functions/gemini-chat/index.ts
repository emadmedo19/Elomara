import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Per-isolate limits; use provider/shared gateway quotas for a global spending cap.
const quotas = new Map<string, { count: number; expires: number }>();
function take(key: string, limit: number, duration: number) {
  const now = Date.now();
  for (const [id, value] of quotas) if (value.expires <= now) quotas.delete(id);
  const value = quotas.get(key);
  if (value) { if (value.count >= limit) return false; value.count++; }
  else { if (quotas.size >= 10000) return false; quotas.set(key, { count: 1, expires: now + duration }); }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!/^Bearer \S+$/i.test(authorization)) {
      return Response.json({ error: "Authentication required." }, { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const headers = { apikey: anonKey, Authorization: authorization };
    const userResponse = await fetch(supabaseUrl + "/auth/v1/user", { headers });
    if (!userResponse.ok) return Response.json({ error: "Invalid session." }, { status: 401, headers: corsHeaders });
    const user = await userResponse.json();
    if (!user.id) return Response.json({ error: "Invalid session." }, { status: 401, headers: corsHeaders });
    const profileResponse = await fetch(supabaseUrl + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) +
      "&select=approved,disabled_at,building_id,role", { headers });
    if (!profileResponse.ok) return Response.json({ error: "Unable to verify account." }, { status: 503, headers: corsHeaders });
    const [profile] = await profileResponse.json();
    if (!profile?.approved || profile.disabled_at || !profile.building_id ||
        !["building_admin", "tenant", "owner"].includes(profile.role)) {
      return Response.json({ error: "An active approved building account is required." }, { status: 403, headers: corsHeaders });
    }
    if (!take("user:" + user.id, 20, 60000) || !take("daily", 1000, 86400000)) {
      return Response.json({ error: "AI usage limit reached." }, { status: 429, headers: { ...corsHeaders, "Retry-After": "60" } });
    }
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "مفتاح Gemini غير مضبوط على خادم التطبيق. أضف GEMINI_API_KEY إلى أسرار Supabase Edge Functions.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    if (rawBody.length > 100000) return Response.json({ error: "Request too large." }, { status: 413, headers: corsHeaders });
    const body = JSON.parse(rawBody);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length || messages.length > 30) {
      return new Response(JSON.stringify({ error: "لا توجد رسالة لإرسالها." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contents = messages
      .filter((message: { role: string; text: string }) => (message.role === "user" || message.role === "model") && typeof message.text === "string")
      .map((message: { role: string; text: string }) => ({
        role: message.role,
        parts: [{ text: message.text.slice(0, 20000) }],
      }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    if (typeof body.systemInstruction === "string" && body.systemInstruction.trim()) {
      requestBody.systemInstruction = { parts: [{ text: body.systemInstruction.slice(0, 8000) }] };
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.error?.message || "تعذر على Gemini معالجة الطلب.";
      return new Response(JSON.stringify({ error: message }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "لم يُرجع Gemini نصًا. جرّب صياغة السؤال مرة أخرى." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("gemini-chat error:", error);
    return new Response(JSON.stringify({ error: "حدث خطأ داخلي أثناء الاتصال بخدمة Gemini." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

