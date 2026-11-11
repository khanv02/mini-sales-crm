import { API_PREFIX } from '@pulse/shared';

/** ADR-015: the refresh token lives in an HttpOnly cookie scoped to the auth routes. */
export const REFRESH_COOKIE_NAME = 'pulse_refresh';
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

export interface RefreshCookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

function cookieAttributes(options: RefreshCookieOptions): string[] {
  const attributes = [
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    // SameSite=Lax: the SPA runs on the same site (docs/api-conventions.md section 1).
    'SameSite=Lax',
  ];
  if (options.secure) {
    attributes.push('Secure');
  }
  return attributes;
}

export function buildRefreshCookie(token: string, options: RefreshCookieOptions): string {
  return [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...cookieAttributes(options),
    `Max-Age=${options.maxAgeSeconds}`,
  ].join('; ');
}

export function buildClearedRefreshCookie(options: { secure: boolean }): string {
  return [
    `${REFRESH_COOKIE_NAME}=`,
    ...cookieAttributes({ ...options, maxAgeSeconds: 0 }),
    'Max-Age=0',
  ].join('; ');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name.length === 0) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function readRefreshCookie(header: string | undefined): string | undefined {
  const token = parseCookies(header)[REFRESH_COOKIE_NAME];
  return token && token.length > 0 ? token : undefined;
}
