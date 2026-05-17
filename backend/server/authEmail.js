/**
 * Transactional auth email — Resend (preferred) or SMTP (nodemailer).
 */
import nodemailer from 'nodemailer'

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim()
const RESEND_FROM = String(process.env.RESEND_FROM || process.env.SMTP_FROM || '').trim()

const SMTP_HOST = String(process.env.SMTP_HOST || '').trim()
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_USER = String(process.env.SMTP_USER || '').trim()
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim()
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || 'noreply@geosyntra.local').trim()
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true'

export function hasResendConfig() {
  return Boolean(RESEND_API_KEY && RESEND_FROM)
}

export function hasSmtpConfig() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS)
}

export function hasEmailConfig() {
  return hasResendConfig() || hasSmtpConfig()
}

export function emailProviderLabel() {
  if (hasResendConfig()) return 'resend'
  if (hasSmtpConfig()) return 'smtp'
  return 'none'
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Resend HTTP ${res.status}`)
  }
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  })
}

/** @param {{ to: string; subject: string; text: string; html: string }} msg */
export async function sendAuthEmail(msg) {
  if (hasResendConfig()) {
    await sendViaResend(msg)
    return
  }
  if (hasSmtpConfig()) {
    await sendViaSmtp(msg)
    return
  }
  throw new Error('email_not_configured')
}
