/// <reference types="node" />
/**
 * HTTP/2 transport to APNs with a single, reused {@link ClientHttp2Session}.
 *
 * APNs strongly prefers long-lived HTTP/2 connections multiplexing many
 * requests. This module lazily opens one session per `(host, port)`, keeps it
 * warm, and transparently re-opens it after a `close`/`goaway`/error so callers
 * never deal with reconnection. It is intentionally generic over the
 * `:path`/headers so the same session powers device pushes, broadcasts, and
 * channel management.
 *
 * @packageDocumentation
 */

import * as http2 from 'node:http2';
import { ApnsError } from './types';

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_AUTHORITY,
} = http2.constants;

/** A single APNs request to dispatch over the session. */
export interface Http2RequestSpec {
  /** HTTP method (`POST`, `GET`, `DELETE`, …). */
  method: string;
  /** Request `:path`, e.g. `/3/device/<token>`. */
  path: string;
  /** Application headers (authorization, apns-*). The pseudo-headers are added. */
  headers: http2.OutgoingHttpHeaders;
  /** Optional UTF-8 request body. */
  body?: string;
}

/** The raw HTTP/2 response, before APNs-specific parsing. */
export interface Http2Response {
  /** The `:status` pseudo-header. */
  status: number;
  /** All response headers (lowercased keys). */
  headers: http2.IncomingHttpHeaders;
  /** The response body decoded as UTF-8 (often empty for 2xx). */
  body: string;
}

/** Construction options for {@link Http2Client}. */
export interface Http2ClientOptions {
  /** Fully-qualified host, e.g. `api.push.apple.com`. */
  host: string;
  /** Port (`443` / `2197` for push, `2196`/`2195` for channel management). */
  port: number;
  /** Connect timeout in ms (default `10_000`). */
  connectTimeoutMs?: number;
  /** Per-request timeout in ms (default `10_000`). */
  requestTimeoutMs?: number;
}

/**
 * Reused, auto-reconnecting HTTP/2 client for one APNs endpoint.
 *
 * Not exported from the package surface directly — {@link createLiveActivityPusher}
 * and {@link createBroadcastChannelManager} own instances of it.
 */
export class Http2Client {
  private readonly authority: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  /** The live session, or `undefined` when disconnected. */
  private session?: http2.ClientHttp2Session;
  /** In-flight connect promise, so concurrent callers share one handshake. */
  private connecting?: Promise<http2.ClientHttp2Session>;
  /** Set once {@link close} is called; further requests are refused. */
  private closed = false;

  constructor(options: Http2ClientOptions) {
    this.authority = `https://${options.host}:${options.port}`;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  }

  /** Lazily connect (or reuse) the session, sharing a concurrent handshake. */
  private connect(): Promise<http2.ClientHttp2Session> {
    if (this.closed) {
      return Promise.reject(
        new ApnsError('transport', 'HTTP/2 client has been closed.')
      );
    }
    const existing = this.session;
    if (existing !== undefined && !existing.closed && !existing.destroyed) {
      return Promise.resolve(existing);
    }
    if (this.connecting !== undefined) return this.connecting;

    this.connecting = new Promise<http2.ClientHttp2Session>((resolve, reject) => {
      const session = http2.connect(this.authority, {
        // APNs requires ALPN h2; node negotiates it for https authorities.
        settings: { enablePush: false },
      });

      const onConnectError = (err: Error): void => {
        cleanup();
        session.destroy();
        if (this.session === session) this.session = undefined;
        reject(
          new ApnsError('transport', `Failed to connect to APNs: ${err.message}`, {
            cause: err,
          })
        );
      };

      const timer = setTimeout(() => {
        onConnectError(new Error(`connect timed out after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);
      // Don't keep the event loop alive solely for the connect timer.
      if (typeof timer.unref === 'function') timer.unref();

      const cleanup = (): void => {
        clearTimeout(timer);
        session.removeListener('error', onConnectError);
      };

      session.once('error', onConnectError);
      session.once('connect', () => {
        cleanup();
        this.session = session;
        this.connecting = undefined;

        // After a successful connect, attach long-lived listeners so a dropped
        // session is forgotten and the next request transparently reconnects.
        const forget = (): void => {
          if (this.session === session) this.session = undefined;
        };
        session.on('error', forget);
        session.once('close', forget);
        session.once('goaway', () => {
          // Graceful shutdown from APNs: stop using this session for new streams.
          forget();
          if (!session.destroyed) session.close();
        });

        resolve(session);
      });
    }).catch((err) => {
      this.connecting = undefined;
      throw err;
    });

    return this.connecting;
  }

  /**
   * Send one request over the (lazily connected) session and resolve the parsed
   * status/headers/body. Rejects with an {@link ApnsError} of kind `'transport'`
   * on connection/stream failures or timeouts.
   */
  async request(spec: Http2RequestSpec): Promise<Http2Response> {
    const session = await this.connect();

    return new Promise<Http2Response>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const requestHeaders: http2.OutgoingHttpHeaders = {
        ...spec.headers,
        [HTTP2_HEADER_METHOD]: spec.method,
        [HTTP2_HEADER_PATH]: spec.path,
        [HTTP2_HEADER_AUTHORITY]: this.authority.replace(/^https:\/\//, ''),
      };

      let stream: http2.ClientHttp2Stream;
      try {
        stream = session.request(requestHeaders);
      } catch (err) {
        finish(() =>
          reject(
            new ApnsError('transport', `Failed to open HTTP/2 stream: ${(err as Error).message}`, {
              cause: err,
            })
          )
        );
        return;
      }

      stream.setEncoding('utf8');
      stream.setTimeout(this.requestTimeoutMs, () => {
        finish(() => {
          stream.close(http2.constants.NGHTTP2_CANCEL);
          reject(
            new ApnsError(
              'transport',
              `APNs request timed out after ${this.requestTimeoutMs}ms.`
            )
          );
        });
      });

      let status = 0;
      let responseHeaders: http2.IncomingHttpHeaders = {};
      let body = '';

      stream.once('response', (headers) => {
        responseHeaders = headers;
        const raw = headers[HTTP2_HEADER_STATUS];
        status = typeof raw === 'number' ? raw : Number(raw) || 0;
      });
      stream.on('data', (chunk: string) => {
        body += chunk;
      });
      stream.once('end', () => {
        finish(() => resolve({ status, headers: responseHeaders, body }));
      });
      stream.once('error', (err) => {
        finish(() =>
          reject(
            new ApnsError('transport', `HTTP/2 stream error: ${err.message}`, {
              cause: err,
            })
          )
        );
      });

      if (spec.body !== undefined) stream.end(spec.body);
      else stream.end();
    });
  }

  /**
   * Gracefully close the session and refuse further requests. Safe to call more
   * than once. In-flight streams are allowed to complete before the socket
   * closes (HTTP/2 graceful close semantics).
   */
  close(): Promise<void> {
    this.closed = true;
    const session = this.session;
    this.session = undefined;
    if (session === undefined || session.closed || session.destroyed) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      session.close(() => resolve());
    });
  }
}
