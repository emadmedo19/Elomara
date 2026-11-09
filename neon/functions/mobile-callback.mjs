export function mobileCallback(request) {
  const url = new URL(request.url);
  const verifier = url.searchParams.get('neon_auth_session_verifier');
  if (!verifier || verifier.length > 4096) return new Response('تعذر إكمال تسجيل الدخول. ارجع للتطبيق وحاول مرة أخرى.', { status: 400 });
  const target = `app.bunyan.residential://login-callback?neon_auth_session_verifier=${encodeURIComponent(verifier)}`;
  const safeTarget = JSON.stringify(target).replaceAll('<', '\\u003c');
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>العودة إلى العمارة</title><p>تم تسجيل الدخول. <a id="open" href="#">العودة إلى تطبيق العمارة</a></p><script nonce="${nonce}">const target=${safeTarget};document.getElementById('open').href=target;location.replace(target);</script></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` },
  });
}
