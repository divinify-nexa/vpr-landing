// Twilio incoming-call webhook
// Logs the call to Supabase vpr_calls, then forwards to the destination number.

export default async function handler(req, res) {
  // Twilio sends webhooks as application/x-www-form-urlencoded POST requests
  const body = req.body || {};

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

  // Fire-and-forget: log the call to Supabase. Don't block the response if it fails.
  if (callSid && supabaseUrl && supabaseServiceKey) {
    fetch(`${supabaseUrl}/rest/v1/vpr_calls`, {
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
    }).catch(err => console.error('[twilio-call] supabase log failed', err));
  }

  // Respond to Twilio with TwiML that forwards the call.
  // The <Dial> verb tells Twilio to bridge the inbound caller to forwardTo.
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial callerId="${toNumber}" timeout="20">${forwardTo}</Dial>
    </Response>`
  );
}

// Vercel needs to know to parse Twilio's form-encoded webhook body
export const config = {
  api: {
    bodyParser: {
      type: 'application/x-www-form-urlencoded'
    }
  }
};
