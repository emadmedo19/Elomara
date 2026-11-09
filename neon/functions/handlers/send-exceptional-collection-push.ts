import { createBackendClient } from "../database.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function base64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
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
  const keyBytes = Uint8Array.from(atob(pem), character => character.charCodeAt(0));
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

export default async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createBackendClient(authorization);
  const adminClient = createBackendClient();

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  let body: { collection_id?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.collection_id) return json({ error: "collection_id is required" }, 400);

  const { data: profile, error: profileError } = await adminClient.from("profiles")
    .select("id,role,approved,building_id,disabled_at")
    .eq("id", authData.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "building_admin" || profile.approved !== true ||
      profile.disabled_at || !profile.building_id) return json({ error: "Forbidden" }, 403);

  const { data: collection, error: collectionError } = await adminClient.from("exceptional_collections")
    .select("id,building_id,title,description,created_by,target_apartment_ids,notify_residents")
    .eq("id", body.collection_id).maybeSingle();
  if (collectionError || !collection) return json({ error: "Collection not found" }, 404);
  if (collection.created_by !== authData.user.id || collection.building_id !== profile.building_id) {
    return json({ error: "Forbidden" }, 403);
  }

  if (!collection.notify_residents) return json({ sent: 0, message: "Notifications disabled" });
  const { data: residents, error: residentsError } = await adminClient.from("profiles")
    .select("id").eq("building_id", collection.building_id).eq("approved", true)
    .is("disabled_at", null).in("role", ["owner", "tenant"]).in("apartment_id", collection.target_apartment_ids);
  if (residentsError) return json({ error: "Could not load residents" }, 500);
  const recipientIds = (residents || []).map((resident: any) => resident.id);
  if (!recipientIds.length) return json({ sent: 0, message: "No approved residents" });

  const { data: devices, error: devicesError } = await adminClient.from("push_devices")
    .select("id,user_id,token").in("user_id", recipientIds);
  if (devicesError) return json({ error: "Could not load devices" }, 500);
  if (!devices?.length) return json({ sent: 0, message: "No registered devices" });

  const rawService = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!rawService) return json({ error: "Push service is not configured yet" }, 503);
  let service: any;
  try { service = JSON.parse(rawService); } catch { return json({ error: "Push service configuration is invalid" }, 503); }
  if (service.project_id !== "elfotoh") return json({ error: "Firebase project mismatch" }, 503);

  try {
    const accessToken = await firebaseAccessToken(service);
    let sent = 0;
    const invalidDeviceIds: string[] = [];
    for (const device of devices) {
      const response = await fetch("https://fcm.googleapis.com/v1/projects/elfotoh/messages:send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: "تحصيل استثنائي جديد",
              body: `تم تسجيل تحصيل استثنائي: ${String(collection.title).slice(0, 120)}. افتح التطبيق لمراجعة التفاصيل والمبلغ المستحق على شقتك.`,
            },
            data: { type: "exceptional_collection", collection_id: collection.id, building_id: collection.building_id },
            android: { priority: "high", notification: { channel_id: "default" } },
          },
        }),
      });
      if (response.ok) { sent++; continue; }
      const failure = await response.text();
      if (failure.includes("UNREGISTERED") || failure.includes("registration-token-not-registered")) invalidDeviceIds.push(device.id);
    }
    if (invalidDeviceIds.length) await adminClient.from("push_devices").delete().in("id", invalidDeviceIds);
    return json({ sent, attempted: devices.length, removed_invalid_tokens: invalidDeviceIds.length });
  } catch (error) {
    console.error("[exceptional-collection-push] Delivery failed", error);
    return json({ error: "Push delivery failed" }, 502);
  }
}
