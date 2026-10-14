export interface SecretDB {
  insertSecret(code: string, issuedAt: Date, activeUntil: Date, expiresAt: Date): Promise<void>;
}

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function generateSecretCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `mukmuk-${suffix}`;
}

export function formatWeeklyNotice(code: string, dashboardUrl: string): string {
  const url = dashboardUrl.replace(/\/+$/, '');
  return [
    '## 🔑 이번 주 웹보드 시크릿 코드',
    '매주 월요일 새로운 코드가 발급됩니다. (기존 코드는 24시간 동안 함께 유지돼요)',
    '',
    '```',
    code,
    '```',
    '',
    `👉 **[웹보드 바로 접속하기](${url}?code=${code})**`
  ].join('\n');
}

export interface RotateDeps {
  db: SecretDB;
  discord: (path: string, payload: Record<string, unknown>) => Promise<Response>;
  noticeChannelId: string;
  dashboardUrl: string;
  now?: () => Date;
  codeGenerator?: () => string;
}

export async function rotateWeeklySecret(deps: RotateDeps): Promise<{
  code: string;
  messageId: string;
  activeUntil: Date;
  expiresAt: Date;
}> {
  const now = deps.now ? deps.now() : new Date();
  const code = deps.codeGenerator ? deps.codeGenerator() : generateSecretCode();

  const activeUntil = new Date(now.getTime() + 7 * 86_400_000);
  const expiresAt = new Date(now.getTime() + 8 * 86_400_000); // 7 days + 24 hours grace

  await deps.db.insertSecret(code, now, activeUntil, expiresAt);

  const content = formatWeeklyNotice(code, deps.dashboardUrl);
  const res = await deps.discord(`/channels/${deps.noticeChannelId}/messages`, { content });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Discord message failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    code,
    messageId: data.id,
    activeUntil,
    expiresAt
  };
}
