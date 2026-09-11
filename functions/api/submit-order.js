// Cloudflare Pages Function: recibe el pedido del carrito (desde el sitio) y lo reenvía a Apps Script.
// La URL de Apps Script NUNCA está en el frontend — solo aquí, como variable de entorno.
// Equivalente a netlify/functions/submit-order.js, adaptado al runtime de Cloudflare Pages.

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (body, status) => new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });

  const appsScriptUrl = env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    console.error('[submit-order] APPS_SCRIPT_URL no está configurada en las variables de entorno');
    return json({ ok: false, error: 'Server misconfiguration: APPS_SCRIPT_URL missing' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'Invalid order payload (bad JSON)' }, 400);
  }

  if (!payload || !payload.customerName || !payload.location || !Array.isArray(payload.items) || payload.items.length === 0) {
    return json({ ok: false, error: 'Invalid order payload' }, 400);
  }

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ source: 'website-order', payload: payload })
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (err) {
      console.error('[submit-order] Apps Script returned non-JSON: ' + text.slice(0, 300));
      return json({ ok: false, error: 'Google Apps Script returned an unexpected response' }, 502);
    }

    if (!response.ok || result.ok === false) {
      console.error('[submit-order] Apps Script error: ' + JSON.stringify(result));
      return json({ ok: false, error: result.error || ('Google Apps Script returned HTTP ' + response.status) }, 502);
    }

    return json(result, 200);
  } catch (err) {
    console.error('[submit-order] Fetch to Apps Script failed: ' + String(err));
    return json({ ok: false, error: 'Could not reach Google Apps Script' }, 502);
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
