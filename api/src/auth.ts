// Auth0 access-token verification.
//
// Every /api route mounted after `requireAuth` runs only for a token this
// server has checked against Auth0's published signing keys. The client can
// no longer name its own user: the identity comes from the `sub` claim of a
// signature-checked token, never from a header the browser controls.
import type { Request } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;
if (!domain || !audience) {
  throw new Error('AUTH0_DOMAIN and AUTH0_AUDIENCE must be set in api/.env (see api/.env.example).');
}

export const AUTH0_DOMAIN = domain;

/**
 * Rejects anything without a valid, unexpired token issued by our tenant
 * *for this API*. The audience check is what stops a token minted for some
 * other API (the Auth0 Management API, say) from being accepted here.
 */
export const requireAuth = auth({
  issuerBaseURL: `https://${domain}/`,
  audience,
});

/** The raw bearer token off the request, for calls made on her behalf. */
export function bearer(req: Request): string {
  const header = req.header('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export interface Auth0Profile {
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
}

/**
 * Who the token belongs to, from Auth0's /userinfo endpoint.
 *
 * The access token carries `sub` but not her email, so this is called only
 * when we meet an Auth0 identity for the first time (to create or adopt a
 * row). Every request after that matches on auth0_sub and never leaves the
 * process.
 */
export async function fetchProfile(token: string): Promise<Auth0Profile> {
  const res = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Auth0 /userinfo returned ${res.status}`);
  const body = (await res.json()) as {
    email?: string; email_verified?: boolean; given_name?: string; name?: string; nickname?: string;
  };
  return {
    email: body.email ?? null,
    emailVerified: Boolean(body.email_verified),
    firstName: body.given_name ?? body.name ?? body.nickname ?? null,
  };
}
