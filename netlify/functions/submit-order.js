// Netlify Function: recibe el pedido del carrito (desde el sitio) y lo reenvía a Apps Script.
// La URL de Apps Script NUNCA está en el frontend — solo aquí, como variable de entorno.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    console.error('[submit-order] APPS_SCRIPT_URL no está configurada en las variables de entorno');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Server misconfiguration: APPS_SCRIPT_URL missing' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid order payload (bad JSON)' }) };
  }

  if (!payload || !payload.customerName || !payload.location || !Array.isArray(payload.items) || payload.items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid order payload' }) };
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
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Google Apps Script returned an unexpected response' }) };
    }

    if (!response.ok || result.ok === false) {
      console.error('[submit-order] Apps Script error: ' + JSON.stringify(result));
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: result.error || ('Google Apps Script returned HTTP ' + response.status) }) };
    }

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[submit-order] Fetch to Apps Script failed: ' + String(err));
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not reach Google Apps Script' }) };
  }
};
