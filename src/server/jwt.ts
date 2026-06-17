/// <reference types="node" />
/**
 * ES256 provider-token (JWT) generation and caching for APNs.
 *
 * APNs token-based authentication requires a short-lived ES256 JWT signed with
 * your `.p8` auth key. Apple imposes two opposing constraints:
 *
 * - A token **older than 60 minutes** is rejected (`403 ExpiredProviderToken`).
 * - Refreshing **faster than every 20 minutes** is rejected
 *   (`429 TooManyProviderTokenUpdates`).
 *
 * This provider therefore signs at most one token per ~50-minute window and
 * reuses it across every request, which is both correct and far cheaper than
 * re-signing per push.
 *
 * The ES256 signature is the JOSE-required **64-byte `r || s`** form (IEEE
 * P1363), *not* DER. We obtain it with
 * `crypto.sign('SHA256', input, { key, dsaEncoding: 'ieee-p1363' })`; using the
 * default DER encoding here would produce tokens APNs rejects.
 *
 * @packageDocumentation
 */

import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

/** Refresh the cached token once it is older than this (ms). ~50 minutes. */
const REFRESH_AFTER_MS = 50 * 60 * 1000;
/**
 * Hard floor (ms) on how often a new token may be minted. APNs rejects faster
 * than 20 minutes; we never refresh below this even if asked.
 */
const MIN_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

/** Base64url-encode a buffer (RFC 7515 §2: no padding, URL-safe alphabet). */
function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/** Base64url-encode a JSON value as its compact UTF-8 serialization. */
function base64urlJson(value: unknown): string {
  return base64url(Buffer.from(JSON.stringify(value), 'utf8'));
}

/** Inputs required to mint APNs provider tokens. */
export interface JwtProviderConfig {
  /** PEM contents of the `.p8` ES256 (EC P-256) private key. */
  key: string;
  /** 10-character APNs Key ID — the JWT `kid` header. */
  keyId: string;
  /** 10-character Apple Team ID — the JWT `iss` claim. */
  teamId: string;
}

/**
 * A reusable APNs provider-token source. Call {@link JwtProvider.getToken} per
 * request; it returns the cached token until it ages past the refresh window,
 * then transparently re-signs.
 */
export class JwtProvider {
  private readonly keyObject: KeyObject;
  private readonly header: string;
  private readonly iss: string;

  /** The currently cached compact JWS, or `undefined` before the first sign. */
  private cachedToken?: string;
  /** Epoch-ms at which {@link cachedToken} was minted. */
  private mintedAt = 0;

  constructor(config: JwtProviderConfig) {
    // Importing the PEM once and reusing the KeyObject avoids re-parsing the key
    // on every refresh.
    this.keyObject = createPrivateKey(config.key);
    // The header never changes, so precompute its base64url segment.
    this.header = base64urlJson({ alg: 'ES256', kid: config.keyId });
    this.iss = config.teamId;
  }

  /**
   * Return a valid provider token, signing a fresh one only when the cached
   * token is older than ~50 minutes (and never more often than every 20).
   *
   * @param now - Override the clock (epoch-ms); for testing.
   */
  getToken(now: number = Date.now()): string {
    if (
      this.cachedToken !== undefined &&
      now - this.mintedAt < REFRESH_AFTER_MS &&
      now - this.mintedAt >= 0
    ) {
      return this.cachedToken;
    }
    return this.sign(now);
  }

  /**
   * Force a token refresh, respecting the 20-minute minimum interval. Returns
   * the (possibly still-cached) token. Useful after a `403 ExpiredProviderToken`
   * to recover without re-creating the provider.
   */
  refresh(now: number = Date.now()): string {
    if (
      this.cachedToken !== undefined &&
      now - this.mintedAt < MIN_REFRESH_INTERVAL_MS &&
      now - this.mintedAt >= 0
    ) {
      // Too soon to mint again — APNs would 429. Reuse what we have.
      return this.cachedToken;
    }
    return this.sign(now);
  }

  /** Mint, cache, and return a new token stamped at `now`. */
  private sign(now: number): string {
    const iat = Math.floor(now / 1000);
    const claims = base64urlJson({ iss: this.iss, iat });
    const signingInput = `${this.header}.${claims}`;
    // `ieee-p1363` yields the 64-byte r||s signature JOSE/ES256 requires (NOT DER).
    const signature = sign('SHA256', Buffer.from(signingInput, 'utf8'), {
      key: this.keyObject,
      dsaEncoding: 'ieee-p1363',
    });
    const token = `${signingInput}.${base64url(signature)}`;
    this.cachedToken = token;
    this.mintedAt = now;
    return token;
  }
}
