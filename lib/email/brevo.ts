const BREVO_TRANSACTIONAL_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_BREVO_TIMEOUT_MS = 10_000;
const DEFAULT_BREVO_RETRY_COUNT = 2;

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

export class EmailDeliveryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

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

function getBrevoTimeoutMs() {
  const parsed = Number.parseInt(process.env.BREVO_TIMEOUT_MS?.trim() || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BREVO_TIMEOUT_MS;
}

function getBrevoRetryCount() {
  const parsed = Number.parseInt(process.env.BREVO_RETRY_COUNT?.trim() || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BREVO_RETRY_COUNT;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const timeoutMs = getBrevoTimeoutMs();
  const retries = getBrevoRetryCount();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
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
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = (await response.json().catch(() => null)) as BrevoResponse | null;

      if (!response.ok) {
        throw new EmailDeliveryError(
          payload?.message || payload?.code || `Brevo email request failed with status ${response.status}`
        );
      }

      if (!payload?.messageId) {
        throw new EmailDeliveryError('Brevo email request succeeded without a messageId');
      }

      return payload.messageId;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      await wait(400 * (attempt + 1));
    }
  }

  throw new EmailDeliveryError('Could not deliver email through Brevo', lastError);
}
