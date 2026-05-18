// Twilio webhook handler — handles both incoming calls AND status callbacks
// Initial call: logs to Supabase + returns TwiML to forward
// Status callback: updates the row with duration, final status, ended_at

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  // Parse Twilio's form-encoded body
  let body = {};
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = Object.fromEntries(new URLSearchParams(raw));
  } catch (e) {
    console.error('[twilio-call] body parse failed', e);
  }

  const callSid = body.CallSid;
  const callStatus = body.CallStatus;
  const callDuration = body.CallDuration; // only present on status callbacks
  const isStatusCallback = !!callDuration || ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus);

  console.log('[twilio-call] event:', isStatusCallback ? 'STATUS_CALLBACK' : 'INITIAL_CALL', 'sid:', callSid, 'status:', callStatus);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const forwardTo = process.env.CALL_FORWARD_TO;

  // ── STATUS CALLBACK: update existing row with final call details ──
  if (isStatusCallback) {
    if (callSid && supabaseUrl && supabaseServiceKey) {
      try {
        const updateRes = await fetch(
          `${supabaseUrl}/rest/v1/vpr_calls?call_sid=eq.${callSid}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              status: callStatus,
              duration_seconds: callDuration ? parseInt(callDuration, 10) : null,
              ended_at: new Date().toISOString()
            })
          }
        );
        console.log('[twilio-call] status update:', updateRes.status);
        if (!updateRes.ok) {
          const errText = await updateRes.text();
          console.error('[twilio-call] status update error:', errText);
        }
      } catch (err) {
        console.error('[twilio-call] status update threw:', err);
      }
    }
    // Status callbacks don't need a TwiML response, just a 200 OK
    res.status(200).send('OK');
    return;
  }

  // ── INITIAL CALL: log new row + return TwiML to forward ──
  const fromNumber = body.From;
  const toNumber = body.To;
  const fromCity = body.FromCity || null;
  const fromState = body.FromState || null;
  const fromZip = body.FromZip || null;
  const fromCountry = body.FromCountry || null;
  const fromCallerName = body.CallerName || null;

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
      console.log('[twilio-call] insert status:', supaRes.status);
      if (!supaRes.ok) {
        const errText = await supaRes.text();
        console.error('[twilio-call] insert error:', errText);
      }
    } catch (err) {
      console.error('[twilio-call] insert threw:', err);
    }
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial callerId="${toNumber || ''}" timeout="20">${forwardTo || ''}</Dial>
    </Response>`
  );
}
