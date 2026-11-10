import { createBackendClient } from "../database.mjs";
interface FirebaseService { client_email: string; private_key: string; project_id: string; token_uri?: string; }
const json = (body: unknown, status=200) => Response.json(body,{status});
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

async function firebaseAccessToken(service: FirebaseService) {
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


// Preserve event-specific details in Android notifications without overflowing the shade.
function summarize(value: string | null | undefined, limit: number) {
  const normalized = String(value || '').replace(/\\s+/g, ' ').trim();
  return normalized.length > limit ? normalized.slice(0, limit - 1).trimEnd() + '…' : normalized;
}

export default async function handle(request: Request) {
  if(request.method!=="POST") return json({error:"Method not allowed"},405);
  const admin=createBackendClient();
  try {
    const service:FirebaseService=JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT_JSON"]||"{}");
    if(service.project_id!=="elfotoh") return json({error:"Push service unavailable"},503);
    const access=await firebaseAccessToken(service);
    const {data:rows,error}=await admin.rpc("claim_mobile_notifications",{batch_size:40});
    if(error) throw new Error("Could not claim notifications");
    let sent=0,failed=0;
    const imageCache = new Map<string, string | null>();
    const getAnnouncementImage = async (notificationId: string, category: string): Promise<string | null> => {
      if (category !== 'announcements') return null;
      if (imageCache.has(notificationId)) return imageCache.get(notificationId) || null;
      const { data: notice } = await admin.from('app_notifications').select('entity_id').eq('id', notificationId).eq('category', 'announcements').maybeSingle();
      if (!notice?.entity_id) { imageCache.set(notificationId, null); return null; }
      const { data: announcement } = await admin.from('announcements').select('image_url,archived_at').eq('id', notice.entity_id).maybeSingle();
      const candidate = String(announcement?.image_url || '');
      // FCM must fetch a publicly reachable HTTPS image; never send base64/data or private URLs.
      let safe: string | null = null;
      try { const url = new URL(candidate); if (url.protocol === 'https:' && !url.username && !url.password && !announcement?.archived_at && !/^(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/i.test(url.hostname)) safe = url.toString(); } catch { /* Not a hosted image URL. */ }
      imageCache.set(notificationId, safe);
      return safe;
    };
    await Promise.all((rows||[]).map(async (row: {delivery_id:string;lease_id:string;notification_id:string;device_id:string;token:string;title:string;body:string;category:string;building_id:string})=>{
      try {
        const imageUrl = await getAnnouncementImage(row.notification_id, row.category);
        const response=await fetch("https://fcm.googleapis.com/v1/projects/elfotoh/messages:send",{
          method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},
          signal:AbortSignal.timeout(15000),
          body:JSON.stringify({message:{token:row.token,notification: {
              title: summarize(row.title, 75) || 'العمارة 🔔',
              body: summarize(row.body, 180) || 'لديك إشعار جديد في التطبيق.',
              ...(imageUrl ? { image: imageUrl } : {}),
            },
            data:{type:row.category},
            android:{priority:"high",ttl:"86400s",notification:{channel_id:"default",tag:row.notification_id,...(imageUrl ? { image: imageUrl } : {})}}}}),
        });
        if(response.ok){
          const {error:ackError}=await admin.from("notification_deliveries").update({completed_at:new Date().toISOString(),outcome:"sent"}).eq("id",row.delivery_id).eq("lease_id",row.lease_id);
          if(ackError) throw new Error("Acknowledgement failed");
          sent++;
        } else {
          const result=await response.json();
          const invalid=result?.error?.details?.some((detail:{errorCode?:string})=>detail.errorCode==="UNREGISTERED");
          if(invalid) await admin.from("push_devices").delete().eq("id",row.device_id).eq("token",row.token);
          else await admin.from("notification_deliveries").update({outcome:`http_${response.status}`}).eq("id",row.delivery_id).eq("lease_id",row.lease_id);
          failed++;
        }
      } catch { failed++; }
    }));
    return json({claimed:rows?.length||0,sent,failed});
  } catch { return json({error:"Notification delivery temporarily unavailable"},503); }
}
