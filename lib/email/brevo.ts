const BREVO_TRANSACTIONAL_URL = 'https://api.brevo.com/v3/smtp/email';

type BrevoRecipient = {
  email: string;
  name?: string;
};

type SendBrevoEmailParams = {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  sandbox?: boolean;
};

type BrevoResponse = {
  messageId?: string;
  code?: string;
  message?: string;
};

export function getBrevoApiKey() {
  return process.env.BREVO_API_KEY?.trim() || '';
}

export function getEmailBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
}

export function getBrevoSender() {
  const email = process.env.BREVO_SENDER_EMAIL?.trim() || '';
  const name = process.env.BREVO_SENDER_NAME?.trim() || 'EnVault';

  if (!email) {
    throw new Error('BREVO_SENDER_EMAIL is missing');
  }

  return { email, name };
}

export async function sendBrevoTransactionalEmail({
  to,
  subject,
  htmlContent,
  textContent,
  sandbox = false,
}: SendBrevoEmailParams): Promise<string> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is missing');
  }

  const sender = getBrevoSender();

  const response = await fetch(BREVO_TRANSACTIONAL_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender,
      to,
      subject,
      htmlContent,
      ...(textContent ? { textContent } : {}),
      ...(sandbox ? { headers: { 'X-Sib-Sandbox': 'drop' } } : {}),
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as BrevoResponse | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.code || `Brevo email request failed with status ${response.status}`
    );
  }

  if (!payload?.messageId) {
    throw new Error('Brevo email request succeeded without a messageId');
  }

  return payload.messageId;
}
