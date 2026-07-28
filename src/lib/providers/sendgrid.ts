type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.SENDGRID_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("SendGrid is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)");
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.body }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SendGrid failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return { id: response.headers.get("x-message-id") || undefined };
}
