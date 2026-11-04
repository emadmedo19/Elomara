import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server setting: ${name}`);
  return value;
};

async function sendTwilioMessage(params: URLSearchParams) {
  const sid = required("TWILIO_ACCOUNT_SID");
  const token = required("TWILIO_AUTH_TOKEN");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Twilio HTTP ${response.status}: ${result?.message ?? "message rejected"}`);
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "Method not allowed" } }, 405);

  try {
    const raw = await req.text();
    const hookSecret = required("SEND_SMS_HOOK_SECRET").replace(/^v1,whsec_/, "");
    const verifier = new Webhook(hookSecret);
    const event = verifier.verify(raw, Object.fromEntries(req.headers)) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };

    const phone = event.user?.phone;
    const otp = event.sms?.otp;
    if (!phone || !otp || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
      return json({ error: { http_code: 400, message: "Invalid phone verification event" } }, 400);
    }

    const whatsappFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const whatsappTemplate = Deno.env.get("TWILIO_WHATSAPP_CONTENT_SID");
    let whatsappFailure = "WhatsApp sender or approved OTP template is not configured.";

    // WhatsApp is attempted first. For business-initiated OTP messages, use an
    // approved Twilio Content Template with {{1}} mapped to the OTP.
    if (whatsappFrom && whatsappTemplate) {
      try {
        const params = new URLSearchParams({
          To: `whatsapp:${phone}`,
          From: whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`,
          ContentSid: whatsappTemplate,
          ContentVariables: JSON.stringify({ "1": otp }),
        });
        await sendTwilioMessage(params);
        return new Response("{}", { status: 200 });
      } catch (error) {
        whatsappFailure = error instanceof Error ? error.message : "WhatsApp delivery failed";
        console.error("WhatsApp OTP delivery failed; trying SMS fallback:", whatsappFailure);
      }
    }

    const smsFrom = required("TWILIO_SMS_FROM");
    const smsBody = `رمز التحقق الخاص بتطبيق العمارة هو: ${otp}. لا تشارك الرمز مع أي شخص.`;
    await sendTwilioMessage(new URLSearchParams({
      To: phone,
      From: smsFrom,
      Body: smsBody,
    }));
    return new Response("{}", { status: 200 });
  } catch (error) {
    console.error("Phone OTP delivery failed:", error);
    return json({
      error: {
        http_code: 500,
        message: "تعذر إرسال رمز التحقق عبر واتساب أو الرسائل النصية. حاول مرة أخرى.",
      },
    }, 500);
  }
});
