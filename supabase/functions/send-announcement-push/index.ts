import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function base64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
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
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + base64url(signature);
  const response = await fetch(service.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Firebase OAuth token exchange failed");
  return result.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  let body: {
    announcement_id?: string;
    event_type?: "payment" | "expense" | "overdue" | "maintenance" | "exceptional_collection";
    exceptional_collection_id?: string;
    maintenance_ticket_id?: string;
    building_id?: string;
    apartment_id?: string;
    unit_number?: string;
    amount?: number;
    title?: string;
    category?: string;
    reason?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // These events are delivered from the transactional inbox, including older APKs.
  // Do not send twice when a client still calls this compatibility endpoint.
  if (body.announcement_id || ["payment", "expense", "maintenance"].includes(body.event_type || "")) {
    return json({ queued: true });
  }

  const { data: profile, error: profileError } = await adminClient.from("profiles")
    .select("id, role, approved, building_id, apartment_id").eq("id", authData.user.id).maybeSingle();
  const isMaintenanceRequest = body.event_type === "maintenance";
  if (profileError || !profile) return json({ error: "Forbidden" }, 403);
  if (isMaintenanceRequest) {
    if (!["owner", "tenant"].includes(profile.role) || profile.approved !== true) {
      return json({ error: "Forbidden" }, 403);
    }
  } else if (profile.role !== "building_admin" || profile.approved !== true || !profile.building_id) {
    return json({ error: "Forbidden" }, 403);
  }

  let eventType = body.event_type || "announcement";
  let buildingId = body.building_id || "";
  let title = "";
  let messageBody = "";
  let dataPayload: Record<string, string> = {};

  if (eventType === "maintenance") {
    if (!body.maintenance_ticket_id) return json({ error: "maintenance_ticket_id is required" }, 400);
    const { data: ticket, error: ticketError } = await adminClient.from("maintenance_tickets")
      .select("id, building_id, apartment_id, unit_number, resident_name, category, title, urgency, created_by")
      .eq("id", body.maintenance_ticket_id).maybeSingle();
    if (ticketError || !ticket) return json({ error: "Maintenance ticket not found" }, 404);
    if (ticket.created_by !== authData.user.id || ticket.building_id !== profile.building_id ||
        !profile.apartment_id || ticket.apartment_id !== profile.apartment_id) {
      return json({ error: "Forbidden" }, 403);
    }
    buildingId = ticket.building_id;
    title = "بلاغ صيانة جديد";
    messageBody = `بلاغ صيانة جديد من الشقة رقم ${String(ticket.unit_number || "").slice(0, 30)}: ${String(ticket.title || "").slice(0, 100)}.`;
    dataPayload = { type: "maintenance", maintenance_ticket_id: ticket.id, building_id: buildingId };
  } else if (body.announcement_id) {
    const { data: announcement, error } = await adminClient.from("announcements")
      .select("id, building_id, title, content, created_by").eq("id", body.announcement_id).maybeSingle();
    if (error || !announcement) return json({ error: "Announcement not found" }, 404);
    if (announcement.created_by !== authData.user.id) return json({ error: "Forbidden" }, 403);
    buildingId = announcement.building_id;
    eventType = "announcement";
    title = announcement.title || "إعلان جديد من إدارة العمارة";
    messageBody = String(announcement.content || "").slice(0, 180);
    dataPayload = { type: "announcement", announcement_id: announcement.id, building_id: buildingId };
  } else {
    if (eventType === "exceptional_collection") {
      if (!body.exceptional_collection_id) return json({ error: "exceptional_collection_id is required" }, 400);
      const { data: collection, error: collectionError } = await adminClient.from("exceptional_collections")
        .select("id, building_id, title, description, amount_mode, total_amount, per_apartment_amount, target_apartment_ids")
        .eq("id", body.exceptional_collection_id).maybeSingle();
      if (collectionError || !collection || collection.building_id !== buildingId || collection.building_id !== profile.building_id) return json({ error: "Exceptional collection not found" }, 404);
      const targetIds = Array.isArray(collection.target_apartment_ids) ? collection.target_apartment_ids : [];
      if (!targetIds.length) return json({ sent: 0, message: "No target apartments" });
      const { data: assignedResidents, error: assignedError } = await adminClient.from("profiles")
        .select("id").eq("building_id", buildingId).eq("approved", true)
        .in("role", ["owner", "tenant"]).in("apartment_id", targetIds);
      if (assignedError) return json({ error: "Could not load target residents" }, 500);
      const recipientIds = (assignedResidents || []).map((p: any) => p.id);
      if (!recipientIds.length) return json({ sent: 0, message: "No approved accounts linked to target apartments" });
      title = "تحصيل استثنائي جديد";
      const amountText = collection.amount_mode === "total"
        ? "سيتم تقسيم المبلغ الإجمالي بالتساوي على الشقق المستهدفة"
        : `نصيب الشقة: ${Number(collection.per_apartment_amount).toLocaleString("ar-EG")} جنيه`;
      messageBody = `${String(collection.title).slice(0, 90)}. ${amountText}. ${String(collection.description || "").slice(0, 90)}`;
      dataPayload = { type: "exceptional_collection", exceptional_collection_id: collection.id, building_id: buildingId };
      const { data: devices, error: devicesError } = await adminClient.from("push_devices")
        .select("id, user_id, token").in("user_id", recipientIds);
      if (devicesError) return json({ error: "Could not load target devices" }, 500);
      return await deliver(devices || [], adminClient, title, messageBody, dataPayload);
    }
    if (!["payment", "expense", "overdue"].includes(eventType) || !buildingId) return json({ error: "Invalid event payload" }, 400);
    if (eventType === "overdue" && !body.apartment_id) return json({ error: "apartment_id is required" }, 400);
    if (eventType === "payment" && (!body.unit_number || typeof body.amount !== "number")) return json({ error: "Payment details are required" }, 400);
    if (eventType === "expense" && (!body.title || typeof body.amount !== "number")) return json({ error: "Expense details are required" }, 400);
    title = eventType === "payment" ? "تم تسجيل سداد جديد" : eventType === "expense" ? "مصروف جديد للعمارة" : "تنبيه تأخر السداد";
    messageBody = eventType === "payment"
      ? `تم تسجيل سداد اشتراك الشقة رقم ${body.unit_number} بمبلغ ${Number(body.amount).toLocaleString("ar-EG")} جنيه.`
      : eventType === "expense"
        ? `تم تسجيل مصروف "${String(body.title).slice(0, 80)}" بمبلغ ${Number(body.amount).toLocaleString("ar-EG")} جنيه. السبب: ${String(body.reason || body.title).slice(0, 100)}. التصنيف: ${String(body.category || "أخرى").slice(0, 50)}.`
        : `اشتراك الشقة رقم ${String(body.unit_number || "").slice(0, 30)} متأخر عن موعد السداد. يرجى مراجعة إدارة العمارة.`;
    dataPayload = { type: eventType, building_id: buildingId, unit_number: String(body.unit_number || "") };
  }

  if (profile.building_id && profile.building_id !== buildingId) return json({ error: "Forbidden" }, 403);

  if (eventType === "maintenance") {
    const { data: managers, error: managersError } = await adminClient.from("profiles")
      .select("id").eq("approved", true).eq("role", "building_admin").eq("building_id", buildingId);
    if (managersError) return json({ error: "Could not load managers" }, 500);
    const recipientIds = (managers || []).map((manager: any) => manager.id);
    if (!recipientIds.length) return json({ sent: 0, message: "No approved managers for this building" });
    const { data: devices, error: devicesError } = await adminClient.from("push_devices")
      .select("id, user_id, token").in("user_id", recipientIds);
    if (devicesError) return json({ error: "Could not load manager devices" }, 500);
    return await deliver(devices || [], adminClient, title, messageBody, dataPayload);
  }

  let recipientQuery = adminClient.from("profiles").select("id").eq("building_id", buildingId)
    .eq("approved", true).in("role", ["owner", "tenant"]);
  if (eventType === "overdue" && body.apartment_id) {
    const { data: apartment, error: apartmentError } = await adminClient.from("apartments")
      .select("id, building_id, unit_number").eq("id", body.apartment_id).maybeSingle();
    if (apartmentError || !apartment || apartment.building_id !== buildingId) return json({ error: "Apartment not found" }, 404);
    if (body.unit_number && String(body.unit_number) !== String(apartment.unit_number)) return json({ error: "Apartment mismatch" }, 400);
    recipientQuery = recipientQuery.eq("id", authData.user.id).limit(0); // replaced below with the apartment's assigned resident only
    const { data: assignedResidents, error: assignedError } = await adminClient.from("profiles")
      .select("id").eq("apartment_id", apartment.id).eq("building_id", buildingId)
      .eq("approved", true).in("role", ["owner", "tenant"]);
    if (assignedError) return json({ error: "Could not load apartment resident" }, 500);
    const recipientIds = (assignedResidents || []).map((p: any) => p.id);
    if (!recipientIds.length) return json({ sent: 0, message: "No approved account is linked to this apartment" });
    const { data: devices, error: devicesError } = await adminClient.from("push_devices").select("id,user_id,token").in("user_id", recipientIds);
    if (devicesError) return json({ error: "Could not load devices" }, 500);
    return await deliver(devices || [], adminClient, title, messageBody, dataPayload);
  }

  const { data: recipients, error: recipientsError } = await recipientQuery;
  if (recipientsError) return json({ error: "Could not load recipients" }, 500);
  const recipientIds = (recipients || []).map((p: any) => p.id);
  if (!recipientIds.length) return json({ sent: 0, message: "No approved residents in this building" });

  const { data: devices, error: devicesError } = await adminClient.from("push_devices")
    .select("id, user_id, token").in("user_id", recipientIds);
  if (devicesError) return json({ error: "Could not load devices" }, 500);
  return await deliver(devices || [], adminClient, title, messageBody, dataPayload);
});

async function deliver(devices: any[], adminClient: any, title: string, messageBody: string, dataPayload: Record<string, string>) {
  if (!devices.length) return json({ sent: 0, message: "No registered devices" });
  const rawService = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!rawService) return json({ error: "Push service is not configured yet" }, 503);
  let service: any;
  try { service = JSON.parse(rawService); } catch { return json({ error: "Push service configuration is invalid" }, 503); }
  if (service.project_id !== "elfotoh") return json({ error: "Firebase project mismatch" }, 503);

  try {
    const accessToken = await firebaseAccessToken(service);
    let sent = 0;
    const invalidDeviceIds: string[] = [];
    const failures: string[] = [];
    for (const device of devices) {
      const response = await fetch("https://fcm.googleapis.com/v1/projects/elfotoh/messages:send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: "العمارة 🔔", body: "لديك تنبيه جديد. افتح التطبيق لمتابعة التفاصيل." },
            data: { type: dataPayload.type || "notification" },
            android: { priority: "high", notification: { channel_id: "default" } },
          },
        }),
      });
      if (response.ok) { sent++; continue; }
      const failure = await response.text();
      failures.push(failure.slice(0, 250));
      if (failure.includes("UNREGISTERED") || failure.includes("registration-token-not-registered")) invalidDeviceIds.push(device.id);
    }
    if (invalidDeviceIds.length) await adminClient.from("push_devices").delete().in("id", invalidDeviceIds);
    return json({ sent, attempted: devices.length, removed_invalid_tokens: invalidDeviceIds.length, failures: failures.length });
  } catch (error) {
    console.error("[building-push] Send failed", error);
    return json({ error: "Push delivery failed" }, 502);
  }
}

