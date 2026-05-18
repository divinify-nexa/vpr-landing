// Twilio incoming-call webhook
// Logs the call to Supabase vpr_calls, then forwards to the destination number.

export const config = {
  api: {
    bodyParser: false  // we'll parse Twilio's form-encoded body ourselves
  }
};

export default async function handler(req, res) {
  // Manually read and parse Twilio's application/x-www-form-urlencoded body
  let body = {};
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = Object.fromEntries(new URLSearchParams(raw));
  } catch (e) {
    console.error('[twilio-call] body parse failed', e);
  }

  console.log('[twilio-call] body keys:', Object.keys(body));
  console.log('[twilio-call] CallSid:', body.CallSid);

  const callSid = body.CallSid;
  const fromNumber = body.From;
  const toNumber = body.To;
  const fromCity = body.FromCity || null;
  const fromState = body.FromState || null;
  const fromZip = body.FromZip || null;
  const fromCountry = body.FromCountry || null;
  const fromCallerName = body.CallerName || null;

  const forwardTo = process.env.CALL_FORWARD_TO;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[twilio-call] env check:', {
    hasForwardTo: !!forwardTo,
    hasSupabaseUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey
  });

  // Log the call to Supabase. Awaited so we can see errors in logs.
  if (callSid && supabaseUrl && supabaseServiceKey) {
    try {
      const supaRes = await fetch(`${supabaseUrl}/rest/v1/vpr_calls`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          call_sid: callSid,
          from_number: fromNumber,
          from_city: fromCity,
          from_state: fromState,
          from_zip: fromZip,
          from_country: fromCountry,
          from_caller_name: fromCallerName,
          to_number: toNumber,
          forwarded_to: forwardTo,
          status: 'initiated',
          raw_payload: body
        })
      });
      console.log('[twilio-call] supabase status:', supaRes.status);
      if (!supaRes.ok) {
        const errText = await supaRes.text();
        console.error('[twilio-call] supabase error body:', errText);
      }
    } catch (err) {
      console.error('[twilio-call] supabase fetch threw:', err);
    }
  } else {
    console.error('[twilio-call] skipped supabase write: missing values');
  }

  // Respond to Twilio with TwiML that forwards the call.
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial callerId="${toNumber || ''}" timeout="20">${forwardTo || ''}</Dial>
    </Response>`
  );
}
