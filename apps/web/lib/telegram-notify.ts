const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: { parseMode?: 'HTML' | 'MarkdownV2'; replyMarkup?: unknown }
): Promise<boolean> {
  if (!API_BASE) {
    console.log(`[TelegramNotify] SIMULATE → chat ${chatId}: ${text.slice(0, 100)}`);
    return true;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: String(chatId),
      text,
    };
    if (options?.parseMode) body.parse_mode = options.parseMode;
    if (options?.replyMarkup) body.reply_markup = options.replyMarkup;

    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[TelegramNotify] Failed: ${res.status}`, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TelegramNotify] Error:', err);
    return false;
  }
}

export async function notifyNewBooking(params: {
  providerTelegramId: bigint;
  customerName: string;
  businessName: string;
  scheduledAt: Date;
  totalPrice: number;
}): Promise<void> {
  const text =
    `🔔 <b>新预约通知</b>\n\n` +
    `🏪 <b>${params.businessName}</b>\n` +
    `👤 客户: ${params.customerName}\n` +
    `🕐 时间: ${params.scheduledAt.toLocaleString('zh-CN')}\n` +
    `💰 金额: ¥${params.totalPrice.toFixed(2)}\n\n` +
    `请及时确认预约。`;

  await sendTelegramMessage(params.providerTelegramId.toString(), text, { parseMode: 'HTML' });
}
