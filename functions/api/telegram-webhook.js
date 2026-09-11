// Cloudflare Pages Function: recibe las actualizaciones del webhook de Telegram (botones y respuestas de texto),
// las reenvía a Apps Script, y responde a Telegram directamente para la parte puramente conversacional.
// Equivalente a netlify/functions/telegram-webhook.js, adaptado al runtime de Cloudflare Pages.
//
// IMPORTANTE: una vez migrado, hay que volver a registrar el webhook con Telegram apuntando a la
// nueva URL (https://TU-DOMINIO/api/telegram-webhook) — ver instrucciones aparte.

export async function onRequestPost(context) {
  const { request, env } = context;

  // Verificación opcional pero recomendada: Telegram manda este header si configuraste secret_token en setWebhook.
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (receivedSecret !== expectedSecret) {
      console.error('[telegram-webhook] Invalid or missing secret token');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const appsScriptUrl = env.APPS_SCRIPT_URL;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!appsScriptUrl || !botToken) {
    console.error('[telegram-webhook] Falta APPS_SCRIPT_URL o TELEGRAM_BOT_TOKEN en variables de entorno');
    return new Response('ok', { status: 200 }); // responder 200 igual para que Telegram no reintente indefinidamente
  }

  let update;
  try {
    update = await request.json();
  } catch (err) {
    console.error('[telegram-webhook] Invalid JSON from Telegram: ' + String(err));
    return new Response('ok', { status: 200 });
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
  return new Response('ok', { status: 200 });
}

export async function onRequestGet() {
  return new Response('Method not allowed', { status: 405 });
}

async function handleCallbackQuery(callbackQuery, appsScriptUrl, botToken) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const parts = data.split(':');
  const action = parts[0];
  const orderId = parts[1];

  // Responder al instante para que el botón deje de "cargar" apenas lo tocan.
  await answerCallbackQuery(botToken, callbackQuery.id);

  if (action === 'priceother') {
    await sendTelegramMessage(botToken, chatId, 'Escribe el delivery para ' + orderId + ' (un monto como 8, o una nota como "Coordinar por WhatsApp"):', {
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
  const match = originalText.match(/para (O-\d+)/);
  if (!match) return; // no es una respuesta que nos interese

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
