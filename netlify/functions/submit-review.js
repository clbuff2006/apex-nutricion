// Netlify Function: recibe la calificación/reseña de un producto (desde el sitio)
// y la reenvía a Apps Script para que quede guardada en una hoja de cálculo.
// La URL de Apps Script NUNCA está en el frontend — solo aquí, como variable de entorno.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    console.error('[submit-review] APPS_SCRIPT_URL no está configurada en las variables de entorno');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Server misconfiguration: APPS_SCRIPT_URL missing' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid review payload (bad JSON)' }) };
  }

  const rating = Number(payload && payload.rating);
  if (!payload || !payload.product || !rating || rating < 1 || rating > 5) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid review payload' }) };
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
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Google Apps Script returned an unexpected response' }) };
    }

    if (!response.ok || result.ok === false) {
      console.error('[submit-review] Apps Script error: ' + JSON.stringify(result));
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: result.error || ('Google Apps Script returned HTTP ' + response.status) }) };
    }

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[submit-review] Fetch to Apps Script failed: ' + String(err));
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not reach Google Apps Script' }) };
  }
};
