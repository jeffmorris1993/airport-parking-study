import 'server-only';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const PARTICIPANT_COOKIE = 'ms_p';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days, covers the whole study window

function secret() {
  const s = process.env.STUDY_SIGNING_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.STUDY_LOCAL_STORE === '1' && !process.env.VERCEL) return 'local-dev-secret-not-for-production';
  throw new Error('STUDY_SIGNING_SECRET is not set (use a long random string).');
}

export function sign(value: string) {
  const mac = createHmac('sha256', secret()).update(value).digest('base64url');
  return `${value}.${mac}`;
}

export function verify(token: string | undefined | null): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const value = token.slice(0, i);
  const expected = Buffer.from(sign(value).slice(i + 1));
  const got = Buffer.from(token.slice(i + 1));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return value;
}

export async function setParticipantCookie(id: string) {
  (await cookies()).set(PARTICIPANT_COOKIE, sign(id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function currentParticipantId(): Promise<string | null> {
  return verify((await cookies()).get(PARTICIPANT_COOKIE)?.value);
}

export function newParticipantId() {
  return randomUUID();
}

/** Short, readable code for interviews and referrals, e.g. P-7K4Q2 (no 0/O/1/I). */
export function newParticipantCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(5);
  return 'P-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Resume token lets a participant continue on another device. */
export function resumeToken(code: string) {
  return createHmac('sha256', secret()).update(`resume:${code}`).digest('base64url').slice(0, 22);
}
