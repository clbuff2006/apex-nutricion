// Netlify Function: recibe las actualizaciones del webhook de Telegram (botones y respuestas de texto),
// las reenvía a Apps Script, y responde a Telegram directamente para la parte puramente conversacional
// (pedir el monto de "Other" no necesita tocar Sheets todavía, solo Apps Script sí actualiza Sheets).

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verificación opcional pero recomendada: Telegram manda este header si configuraste secret_token en setWebhook.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const receivedSecret = event.headers['x-telegram-bot-api-secret-token'];
    if (receivedSecret !== expectedSecret) {
      console.error('[telegram-webhook] Invalid or missing secret token');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!appsScriptUrl || !botToken) {
    console.error('[telegram-webhook] Falta APPS_SCRIPT_URL o TELEGRAM_BOT_TOKEN en variables de entorno');
    return { statusCode: 200, body: 'ok' }; // responder 200 igual para que Telegram no reintente indefinidamente
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (err) {
    console.error('[telegram-webhook] Invalid JSON from Telegram: ' + String(err));
    return { statusCode: 200, body: 'ok' };
  }

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, appsScriptUrl, botToken);
    } else if (update.message && update.message.reply_to_message) {
      await handleReplyMessage(update.message, appsScriptUrl, botToken);
    }
    // Cualquier otro tipo de update (mensajes sueltos, etc.) se ignora silenciosamente.
  } catch (err) {
    console.error('[telegram-webhook] Error handling update: ' + String(err));
  }

  // Siempre 200 rápido, para que Telegram no reintente el mismo update una y otra vez.
  return { statusCode: 200, body: 'ok' };
};

async function handleCallbackQuery(callbackQuery, appsScriptUrl, botToken) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const parts = data.split(':');
  const action = parts[0];
  const orderId = parts[1];

  // Responder al instante para que el botón deje de "cargar" apenas lo tocan.
  // Lo que tarde más (Apps Script + el próximo mensaje) sigue después, sin que el usuario vea el spinner.
  await answerCallbackQuery(botToken, callbackQuery.id);

  if (action === 'priceother') {
    await sendTelegramMessage(botToken, chatId, 'Escribe el monto de delivery para ' + orderId + ':', {
      force_reply: true
    });
    return;
  }

  const body = { source: 'netlify-telegram', action: action, orderId: orderId };
  if (parts[2] !== undefined) body.value = parts[2]; // ej: price:O-00001:5 -> value "5"

  const result = await forwardToAppsScript(appsScriptUrl, body);
  if (!result || result.ok === false) {
    await sendTelegramMessage(botToken, chatId, '⚠️ Error procesando la acción: ' + (result && result.error), null);
  }
}

async function handleReplyMessage(message, appsScriptUrl, botToken) {
  const originalText = message.reply_to_message.text || '';
  const match = originalText.match(/para (O-\d+):/);
  if (!match) return; // no es una respuesta que nos interese (no viene de nuestro prompt "Escribe el monto...")

  const orderId = match[1];
  const value = (message.text || '').trim();
  const chatId = message.chat.id;

  const result = await forwardToAppsScript(appsScriptUrl, {
    source: 'netlify-telegram',
    action: 'delivery_price',
    orderId: orderId,
    value: value
  });

  if (!result || result.ok === false) {
    await sendTelegramMessage(botToken, chatId, 'No se pudo registrar el monto: ' + (result && result.error), null);
  }
  // Si fue exitoso, Apps Script ya manda su propio mensaje de confirmación — no hace falta duplicar aquí.
}

async function forwardToAppsScript(appsScriptUrl, body) {
  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    return JSON.parse(text);
  } catch (err) {
    console.error('[telegram-webhook] forwardToAppsScript failed: ' + String(err));
    return { ok: false, error: 'Could not reach Google Apps Script' };
  }
}

async function sendTelegramMessage(botToken, chatId, text, replyMarkup) {
  const params = new URLSearchParams();
  params.set('chat_id', String(chatId));
  params.set('text', text);
  if (replyMarkup) params.set('reply_markup', JSON.stringify(replyMarkup));

  await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
}

async function answerCallbackQuery(botToken, callbackQueryId, text) {
  const params = new URLSearchParams();
  params.set('callback_query_id', callbackQueryId);
  if (text) params.set('text', text);

  await fetch('https://api.telegram.org/bot' + botToken + '/answerCallbackQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
}
