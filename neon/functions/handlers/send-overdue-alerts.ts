import { createBackendClient } from "../database.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function firebaseAccessToken(service: any) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: service.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: service.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const pem = String(service.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + base64url(signature);
  const response = await fetch(service.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Firebase OAuth token exchange failed");
  return result.access_token as string;
}

export default async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createBackendClient();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value || "";
  const year = part("year");
  const month = part("month");
  const day = Number(part("day"));
  const monthStart = `${year}-${month}-01`;
  const today = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const dueMonth = `${year}-${month}`;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();

  const [buildingResult, apartmentResult, settingsResult] = await Promise.all([
    admin.from("buildings").select("id,name"),
    admin.from("apartments").select("id,building_id,unit_number,monthly_fee,credit_balance,overdue_months,payment_status").not("building_id", "is", null),
    admin.from("app_settings").select("building_id,setting_value").eq("setting_key", "general"),
  ]);
  if (buildingResult.error || apartmentResult.error || settingsResult.error) {
    console.error("[Bunyan overdue] Could not load building data", buildingResult.error || apartmentResult.error || settingsResult.error);
    return json({ error: "Could not load building data" }, 500);
  }

  const buildings = buildingResult.data || [];
  const apartments = apartmentResult.data || [];
  const settingsByBuilding = new Map<string, { overdueAlert?: boolean; collectionDay?: number }>((settingsResult.data || []).map((row: any) => [row.building_id, row.setting_value || {}]));
  if (!buildings.length || !apartments.length) {
    return json({ checked: apartments.length, overdue: 0, sent: 0, message: "No apartments to check" });
  }

  const buildingIds = buildings.map((building: any) => building.id);
  const [paymentResult, profileResult] = await Promise.all([
    admin.from("payments")
      .select("apartment_id,amount")
      .in("building_id", buildingIds)
      .gte("payment_date", monthStart)
      .lte("payment_date", today),
    admin.from("profiles")
      .select("id,apartment_id")
      .in("building_id", buildingIds)
      .eq("approved", true)
      .in("role", ["owner", "tenant"]),
  ]);
  if (paymentResult.error || profileResult.error) {
    console.error("[Bunyan overdue] Could not load payment or resident data", paymentResult.error || profileResult.error);
    return json({ error: "Could not load payment or resident data" }, 500);
  }

  const paymentsByApartment = new Map<string, number>();
  for (const payment of paymentResult.data || []) {
    paymentsByApartment.set(
      payment.apartment_id,
      (paymentsByApartment.get(payment.apartment_id) || 0) + Number(payment.amount || 0),
    );
  }
  const profilesByApartment = new Map<string, string[]>();
  for (const profile of profileResult.data || []) {
    if (!profile.apartment_id) continue;
    const current = profilesByApartment.get(profile.apartment_id) || [];
    current.push(profile.id);
    profilesByApartment.set(profile.apartment_id, current);
  }

  const userIds = [...new Set((profileResult.data || []).map((profile: any) => profile.id))];
  const { data: deviceRows, error: deviceError } = userIds.length
    ? await admin.from("push_devices").select("id,user_id,token").in("user_id", userIds)
    : { data: [], error: null };
  if (deviceError) return json({ error: "Could not load registered devices" }, 500);

  const devicesByUser = new Map<string, any[]>();
  for (const device of deviceRows || []) {
    const current = devicesByUser.get(device.user_id) || [];
    current.push(device);
    devicesByUser.set(device.user_id, current);
  }

  let checked = 0;
  let overdue = 0;
  let sent = 0;
  let skippedBeforeDueDay = 0;
  let noResidentDevice = 0;
  let failed = 0;
  let accessToken: string | null = null;
  let firebaseService: any = null;

  for (const building of buildings) {
    const preferences = settingsByBuilding.get(building.id) || {};
    if (preferences.overdueAlert === false) continue;
    const configuredDay = Number(preferences.collectionDay || 1);
    const collectionDay = Math.min(daysInMonth, Math.max(1, Number.isFinite(configuredDay) ? configuredDay : 1));
    if (day <= collectionDay) {
      skippedBeforeDueDay++;
      continue;
    }

    const buildingApartments = apartments.filter((apartment: any) => apartment.building_id === building.id);
    for (const apartment of buildingApartments) {
      checked++;
      const monthlyFee = Number(apartment.monthly_fee || 0);
      if (monthlyFee <= 0) continue;
      const paidThisMonth = paymentsByApartment.get(apartment.id) || 0;
      const credit = Number(apartment.credit_balance || 0);
      const amountDue = Math.max(0, monthlyFee - paidThisMonth - credit);
      if (amountDue <= 0) continue;

      overdue++;
      if (apartment.payment_status !== "overdue") {
        const { error: statusError } = await admin.from("apartments").update({
          payment_status: "overdue",
          overdue_months: Math.max(1, Number(apartment.overdue_months || 0)),
        }).eq("id", apartment.id);
        if (statusError) console.warn("[Bunyan overdue] Could not update apartment status", apartment.id, statusError.message);
      }

      const recipientIds = profilesByApartment.get(apartment.id) || [];
      const devices = recipientIds.flatMap((userId) => devicesByUser.get(userId) || []);
      if (!devices.length) {
        noResidentDevice++;
        continue;
      }

      const logKey = `overdue_push_${dueMonth}_${apartment.id}`;
      const { data: previousLog, error: logReadError } = await admin.from("app_settings")
        .select("id")
        .eq("building_id", building.id)
        .eq("setting_key", logKey)
        .maybeSingle();
      if (logReadError) {
        failed++;
        console.warn("[Bunyan overdue] Could not check duplicate alert", apartment.id, logReadError.message);
        continue;
      }
      if (previousLog) continue;

      const { data: logRow, error: logInsertError } = await admin.from("app_settings").insert({
        building_id: building.id,
        setting_key: logKey,
        setting_value: { due_month: dueMonth, apartment_id: apartment.id, created_at: new Date().toISOString() },
      }).select("id").single();
      if (logInsertError || !logRow) {
        if (logInsertError?.code !== "23505") {
          failed++;
          console.warn("[Bunyan overdue] Could not reserve alert record", apartment.id, logInsertError?.message);
        }
        continue;
      }

      try {
        if (!firebaseService) {
          const rawService = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
          if (!rawService) throw new Error("Firebase service account is not configured");
          firebaseService = JSON.parse(rawService);
          if (firebaseService.project_id !== "elfotoh") throw new Error("Firebase project mismatch");
        }
        if (!accessToken) accessToken = await firebaseAccessToken(firebaseService);

        const invalidDeviceIds: string[] = [];
        let apartmentSent = 0;
        for (const device of devices) {
          const response = await fetch("https://fcm.googleapis.com/v1/projects/elfotoh/messages:send", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: device.token,
                notification: {
                  title: "تنبيه تأخر السداد - برج الفتوح",
                  body: `اشتراك الشقة رقم ${String(apartment.unit_number)} متأخر عن موعد التحصيل. المتبقي: ${amountDue.toLocaleString("ar-EG")} جنيه.`,
                },
                data: {
                  type: "overdue",
                  building_id: building.id,
                  apartment_id: apartment.id,
                  unit_number: String(apartment.unit_number),
                  due_month: dueMonth,
                },
                android: { priority: "high", notification: { channel_id: "default" } },
              },
            }),
          });
          if (response.ok) {
            apartmentSent++;
            continue;
          }
          const failureText = await response.text();
          if (failureText.includes("UNREGISTERED") || failureText.includes("registration-token-not-registered")) {
            invalidDeviceIds.push(device.id);
          }
          console.warn("[Bunyan overdue] FCM delivery failed", response.status, failureText.slice(0, 180));
        }

        if (invalidDeviceIds.length) {
          await admin.from("push_devices").delete().in("id", invalidDeviceIds);
        }
        if (apartmentSent > 0) {
          sent += apartmentSent;
        } else {
          failed++;
          await admin.from("app_settings").delete().eq("id", logRow.id);
        }
      } catch (error) {
        failed++;
        await admin.from("app_settings").delete().eq("id", logRow.id);
        console.error("[Bunyan overdue] Alert delivery failed", error);
      }
    }
  }

  return json({
    checked,
    overdue,
    sent,
    failed,
    noResidentDevice,
    skippedBeforeDueDay,
    due_month: dueMonth,
    timezone: "Africa/Cairo",
  });
}
