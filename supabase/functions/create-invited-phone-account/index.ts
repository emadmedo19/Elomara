import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function normalizeEgyptianPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (/^201[0125]\d{8}$/.test(digits)) return "+" + digits;
  if (/^01[0125]\d{8}$/.test(digits)) return "+2" + digits;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const inviteCode = String(body?.invite_code ?? "").trim();
    const password = String(body?.password ?? "");

    if (!/^PH-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteCode)) {
      return json({ error: "رابط الدعوة غير صحيح." }, 400);
    }
    if (password.length < 8 || password.length > 72) {
      return json({ error: "كلمة المرور يجب أن تكون من 8 إلى 72 حرفًا." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables.");
      return json({ error: "خدمة إنشاء الحساب غير مهيأة حاليًا." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const inviteUuid = inviteCode.slice(3);
    const { data: invite, error: inviteError } = await admin
      .from("building_invites")
      .select("invite_code, invited_phone, invited_name, expires_at, accepted_at")
      .eq("invite_code", inviteUuid)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (inviteError) {
      console.error("Invite lookup failed:", inviteError.message);
      return json({ error: "تعذر التحقق من الدعوة. حاول مرة أخرى." }, 500);
    }
    if (!invite?.invited_phone) {
      return json({ error: "الدعوة غير صالحة أو منتهية أو مستخدمة بالفعل." }, 400);
    }

    const phone = normalizeEgyptianPhone(invite.invited_phone);
    if (!phone) {
      return json({ error: "رقم الموبايل المرتبط بالدعوة غير صالح." }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      password,
      user_metadata: { full_name: invite.invited_name || "" },
    });

    if (createError) {
      const message = createError.message.toLowerCase();
      if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
        return json({ code: "USER_EXISTS", error: "هذا الرقم لديه حساب بالفعل. سجّل الدخول بحسابك الحالي لقبول الدعوة." });
      }
      console.error("Invited account creation failed:", createError.message);
      return json({ error: "تعذر إنشاء الحساب. راجع كلمة المرور وحاول مرة أخرى." }, 400);
    }

    return json({
      success: true,
      phone,
      full_name: invite.invited_name || "",
      user_id: created.user?.id ?? null,
    });
  } catch (error) {
    console.error("Invited account request failed:", error);
    return json({ error: "حدث خطأ غير متوقع أثناء إنشاء الحساب." }, 500);
  }
});
