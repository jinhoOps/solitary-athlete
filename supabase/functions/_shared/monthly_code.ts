import { dashboardLink } from './dashboard-link.ts';

export interface MonthlySecret { code: string; activeUntil: Date; expiresAt: Date }
export type WeeklySecret = MonthlySecret;

export interface SecretDB {
  reserveSecret?(code: string, now: Date, activeUntil: Date, expiresAt: Date): Promise<MonthlySecret>;
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

export function formatMonthlyNotice(code: string, dashboardUrl: string): string {
  const url = dashboardLink(dashboardUrl, code);
  return [
    '## 이번 달 웹보드 시크릿 코드예요 <:mukmuk_hi:1560534653893353472>',
    '저... 이번 달 시크릿 코드 살포시 두고 갈게요.',
    '매월 1일에 새로운 코드로 바뀌어요. (기존 코드는 24시간 동안 함께 유지돼요)',
    '',
    '링크로 접속하거나 코드를 한 번 입력해 두면 브라우저에 저장되어서, 유효기간 동안은 매번 입력하지 않아도 바로 열려요 🌱',
    '',
    '```',
    code,
    '```',
    '',
    `👉 [**웹보드 바로 접속하기**](${url})`
  ].join('\n');
}

export const formatWeeklyNotice = formatMonthlyNotice;

export type DiscordApiCall = (
  method: string,
  path: string,
  payload?: Record<string, unknown>
) => Promise<Response>;

export interface RotateDeps {
  db: SecretDB;
  discord: DiscordApiCall;
  noticeChannelId: string;
  botUserId: string;
  dashboardUrl: string;
  now?: () => Date;
  codeGenerator?: () => string;
}

export async function rotateMonthlySecret(deps: RotateDeps): Promise<{
  code: string;
  messageId: string;
  activeUntil: Date;
  expiresAt: Date;
}> {
  const now = deps.now ? deps.now() : new Date();
  let code = deps.codeGenerator ? deps.codeGenerator() : generateSecretCode();

  const kst = new Date(now.getTime() + 9 * 3_600_000);
  let activeUntil = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 1) - 9 * 3_600_000);
  let expiresAt = new Date(activeUntil.getTime() + 86_400_000);

  if (deps.db.reserveSecret) {
    ({ code, activeUntil, expiresAt } = await deps.db.reserveSecret(code, now, activeUntil, expiresAt));
  } else {
    await deps.db.insertSecret(code, now, activeUntil, expiresAt);
  }

  const content = formatMonthlyNotice(code, deps.dashboardUrl);

  // Discover only our notices; match both weekly and monthly notices to clean up cleanly.
  const existingIds: string[] = [];
  let matchingId: string | undefined;
  let matchingContent: string | undefined;
  let before = '';
  for (;;) {
    const listRes = await deps.discord('GET', `/channels/${deps.noticeChannelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    if (!listRes.ok) throw new Error(`Discord notice history failed: ${listRes.status}`);
    const messages = await listRes.json() as Array<{ id: string; content?: string; author?: { id: string } }>;
    for (const message of messages) {
      if (message.author?.id === deps.botUserId && (
        message.content?.includes('🔑 이번 달 웹보드 시크릿 코드') ||
        message.content?.includes('🔑 이번 주 웹보드 시크릿 코드') ||
        message.content?.includes('웹보드 시크릿 코드')
      )) {
        if (!matchingId && message.content?.includes(`\n${code}\n`)) {
          matchingId = message.id;
          matchingContent = message.content;
        } else {
          existingIds.push(message.id);
        }
      }
    }
    if (messages.length < 100) break;
    before = messages[messages.length - 1].id;
  }

  // Publish first: an outage must leave the previous announcement visible.
  let messageId = matchingId;
  if (messageId && matchingContent !== content) {
    const updated = await deps.discord('PATCH', `/channels/${deps.noticeChannelId}/messages/${messageId}`, { content, allowed_mentions: { parse: [] } });
    if (!updated.ok) throw new Error(`Discord notice update failed: ${updated.status}`);
  }
  if (!messageId) {
    const postRes = await deps.discord('POST', `/channels/${deps.noticeChannelId}/messages`, { content, allowed_mentions: { parse: [] }, nonce: code, enforce_nonce: true });
    if (!postRes.ok) throw new Error(`Discord notice publish failed: ${postRes.status}`);
    messageId = (await postRes.json() as { id: string }).id;
    if (!messageId) throw new Error('Discord notice missing message ID');
  }
  for (const id of existingIds) {
    const deleted = await deps.discord('DELETE', `/channels/${deps.noticeChannelId}/messages/${id}`);
    if (!deleted.ok && deleted.status !== 404) throw new Error(`Discord old notice deletion failed: ${deleted.status}`);
  }

  return {
    code,
    messageId,
    activeUntil,
    expiresAt
  };
}

export const rotateWeeklySecret = rotateMonthlySecret;
