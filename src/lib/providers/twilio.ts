type SendSmsInput = {
  to: string;
  body: string;
};

export async function sendSms(input: SendSmsInput): Promise<{ id?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)",
    );
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: input.to,
    From: from,
    Body: input.body,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(json.message || `Twilio failed (${response.status})`);
  }

  return { id: json.sid };
}
