// Cloudflare Pages Function: recibe la calificación/reseña de un producto (desde el sitio)
// y la reenvía a Apps Script para que quede guardada en una hoja de cálculo.
// La URL de Apps Script NUNCA está en el frontend — solo aquí, como variable de entorno.
// Equivalente a netlify/functions/submit-review.js, adaptado al runtime de Cloudflare Pages.

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (body, status) => new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });

  const appsScriptUrl = env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    console.error('[submit-review] APPS_SCRIPT_URL no está configurada en las variables de entorno');
    return json({ ok: false, error: 'Server misconfiguration: APPS_SCRIPT_URL missing' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'Invalid review payload (bad JSON)' }, 400);
  }

  const rating = Number(payload && payload.rating);
  const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!payload || !payload.product || !rating || rating < 1 || rating > 5 || !name) {
    return json({ ok: false, error: 'Invalid review payload' }, 400);
  }

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ source: 'website-review', payload: payload })
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (err) {
      console.error('[submit-review] Apps Script returned non-JSON: ' + text.slice(0, 300));
      return json({ ok: false, error: 'Google Apps Script returned an unexpected response' }, 502);
    }

    if (!response.ok || result.ok === false) {
      console.error('[submit-review] Apps Script error: ' + JSON.stringify(result));
      return json({ ok: false, error: result.error || ('Google Apps Script returned HTTP ' + response.status) }, 502);
    }

    return json(result, 200);
  } catch (err) {
    console.error('[submit-review] Fetch to Apps Script failed: ' + String(err));
    return json({ ok: false, error: 'Could not reach Google Apps Script' }, 502);
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
