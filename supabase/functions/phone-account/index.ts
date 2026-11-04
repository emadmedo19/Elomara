import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^01[0125]\d{8}$/.test(digits)) return "+2" + digits;
  if (/^201[0125]\d{8}$/.test(digits)) return "+" + digits;
  if (/^00201[0125]\d{8}$/.test(digits)) return "+" + digits.slice(2);
  throw new Error("أدخل رقم موبايل مصري صحيح.");
}
async function accountEmail(phone: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone));
  const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
  return "resident-" + hash + "@accounts.elomara.invalid";
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) return json({ error: "حجم الطلب غير صالح." }, 413);
  try {
    const payload = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "بيانات الطلب غير صالحة." }, 400);
    }
    const { phone: rawPhone, password, fullName } = payload;
    const phone = normalizePhone(String(rawPhone ?? ""));
    if (typeof password !== "string" || password.length < 8) return json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف." }, 400);
    if (typeof fullName !== "string" || fullName.trim().length < 2) return json({ error: "اكتب الاسم بالكامل." }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Auth service is not configured");
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = await accountEmail(phone);
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName.trim(), auth_method: "phone_password" },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")) {
        return json({ error: "تعذر إنشاء الحساب. لو سبق لك التسجيل، جرّب تسجيل الدخول برقم الموبايل." }, 400);
      }
      console.error("phone-account createUser failed", error.message);
      return json({ error: "تعذر إنشاء الحساب حاليًا. حاول مرة أخرى لاحقًا." }, 500);
    }
    const { error: profileError } = await admin.from("profiles").update({
      phone, full_name: fullName.trim(),
    }).eq("id", data.user.id);
    if (profileError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error("phone-account orphan cleanup failed", cleanupError.message);
      console.error("phone-account profile update failed", profileError.message);
      return json({ error: "تعذر إكمال إنشاء الحساب. حاول مرة أخرى لاحقًا." }, 500);
    }
    return json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "أدخل رقم موبايل مصري صحيح.") {
      return json({ error: error.message }, 400);
    }
    console.error("phone-account unexpected failure", error instanceof Error ? error.message : "unknown");
    return json({ error: "تعذر إنشاء الحساب حاليًا. راجع البيانات وحاول مرة أخرى." }, 500);
  }
});
