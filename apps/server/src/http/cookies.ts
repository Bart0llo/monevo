import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';

// Cookie helpers (authentication.md#4-sessions). `__Host-` cookies need Secure and Path=/, so the
// prefix is dropped when INSECURE_COOKIES=true allows plain HTTP.

export interface CookieSettings {
  readonly insecureCookies: boolean;
}

export const SESSION_COOKIE = 'monevo_session';
export const OIDC_STATE_COOKIE = 'monevo_oidc';

export function cookieName(base: string, settings: CookieSettings): string {
  return settings.insecureCookies ? base : `__Host-${base}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const value = parseCookie(header)[name];
  return value === undefined || value === '' ? undefined : value;
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
  settings: CookieSettings,
): void {
  res.append(
    'Set-Cookie',
    stringifySetCookie({
      name,
      value,
      maxAge: maxAgeSeconds,
      path: '/',
      httpOnly: true,
      secure: !settings.insecureCookies,
      sameSite: 'lax',
    }),
  );
}

export function clearCookie(res: Response, name: string, settings: CookieSettings): void {
  setCookie(res, name, '', 0, settings);
}
