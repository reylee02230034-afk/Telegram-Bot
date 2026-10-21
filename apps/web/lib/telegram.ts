import crypto from 'crypto';

export interface TelegramInitData {
  query_id?: string;
  user?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    avatar_url?: string;
  };
  auth_date?: number;
  hash: string;
}

function parseQueryString(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = input.split('&');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eqIdx));
    const value = decodeURIComponent(pair.slice(eqIdx + 1));
    result[key] = value;
  }
  return result;
}

function toOrderedString(obj: Record<string, string>): string {
  const keys = Object.keys(obj).filter(k => k !== 'hash').sort();
  return keys.map(k => `${k}=${obj[k]}`).join('\n');
}

export function verifyTelegramInitData(raw: string): TelegramInitData | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN 未配置，开发模式下跳过验证');
    return parseInitData(raw);
  }

  const params = parseQueryString(raw);
  const receivedHash = params.hash;
  if (!receivedHash) return null;

  const ordered = toOrderedString(params);
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(ordered)
    .digest('hex');

  if (computedHash !== receivedHash) {
    console.warn('[Telegram] InitData hash 不匹配');
    return null;
  }

  const authDate = params.auth_date ? parseInt(params.auth_date, 10) : undefined;
  if (authDate) {
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.warn('[Telegram] InitData auth_date 已过期');
      return null;
    }
  }

  return parseInitData(raw);
}

function parseInitData(raw: string): TelegramInitData | null {
  try {
    const params = parseQueryString(raw);
    const result: TelegramInitData = { hash: params.hash };

    if (params.user) {
      result.user = JSON.parse(params.user);
    }
    if (params.query_id) result.query_id = params.query_id;
    if (params.auth_date) result.auth_date = parseInt(params.auth_date, 10);

    return result;
  } catch (e) {
    console.error('[Telegram] 解析 initData 失败:', e);
    return null;
  }
}
