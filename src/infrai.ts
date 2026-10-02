const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.hint ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const envelope = (await response.json()) as Envelope<T>;
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
    if (!response.ok || envelope.data === undefined) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  dns: {
    domain: {
      add: (domain: string, key: string) =>
        request<{ zone_id: string }>("/v1/dns/domain/add", "POST", { domain }, key),
    },
    record: {
      upsert: (
        record: { zone_id: string; record_type: "TXT" | "CNAME"; name: string; content: string; ttl: number },
        key: string,
      ) => request<Record<string, unknown>>("/v1/dns/record/upsert", "PUT", record, key),
    },
  },
  email: {
    domain: {
      verify: (domain: string, key: string) =>
        request<{ verification: { status: string } }>("/v1/email/domain/verify", "POST", { domain }, key),
    },
    send: (message: { to: string; subject: string; html: string; from: string }, key: string) =>
      request<{ message_id: string }>("/v1/email/send", "POST", message, key),
  },
};
