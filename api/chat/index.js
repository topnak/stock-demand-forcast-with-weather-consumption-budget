/**
 * Azure Function: POST /api/chat
 * Proxies chat requests to Azure OpenAI so the API key stays server-side.
 */
module.exports = async function (context, req) {
  // Read secrets from App Settings (environment variables)
  const endpoint   = process.env.OPENAI_ENDPOINT;
  const deployment = process.env.OPENAI_DEPLOYMENT;
  const apiKey     = process.env.OPENAI_API_KEY;
  const apiVersion = process.env.OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !deployment || !apiKey) {
    context.res = { status: 503, body: { error: 'Chat service is not configured.' } };
    return;
  }

  const body = req.body;
  if (!body || !Array.isArray(body.messages)) {
    context.res = { status: 400, body: { error: 'Request must include a messages array.' } };
    return;
  }

  // Cap messages to prevent abuse
  const messages = body.messages.slice(-30);

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages,
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      context.log.error(`OpenAI API error ${resp.status}: ${errText}`);
      context.res = { status: 502, body: { error: 'AI service returned an error.' } };
      return;
    }

    const result = await resp.json();
    const assistantMsg = result.choices[0].message.content.trim();

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { reply: assistantMsg }
    };
  } catch (err) {
    context.log.error('Proxy error:', err.message);
    context.res = { status: 502, body: { error: 'Failed to reach AI service.' } };
  }
};
