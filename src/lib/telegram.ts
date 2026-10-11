function telegramCreds() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return null
  return { token, chatId }
}

export async function sendTelegram(text: string, opts?: { parseMode?: 'Markdown' | 'HTML' }): Promise<void> {
  const creds = telegramCreds()
  if (!creds) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skipping notification')
    return
  }
  const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: creds.chatId,
      text,
      ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`)
  }
}

export async function sendTelegramPhoto(photo: Buffer, caption: string, opts?: { parseMode?: 'Markdown' | 'HTML' }): Promise<void> {
  const creds = telegramCreds()
  if (!creds) {
    console.warn('[telegram] credentials missing — skipping photo notification')
    return
  }
  const form = new FormData()
  form.append('chat_id', creds.chatId)
  form.append('caption', caption)
  form.append('parse_mode', opts?.parseMode ?? 'Markdown')
  form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'tweet.png')

  const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendPhoto`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Telegram sendPhoto failed: ${res.status} ${body}`)
  }
}
