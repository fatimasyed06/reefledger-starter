import { verifyMessage, getAddress, isAddress } from 'ethers';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60;
const AUTH_MAX_AGE_SEC = 120;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_IP = 20;
const RATE_LIMIT_WALLET = 8;

// Isolate-local stores. Better than Cloudflare Cache API for this use case, but NOT
 // durable across Worker isolates/colos. Use KV/Durable Objects before open public abuse load.
const usedSignatures = new Map();
const rateBuckets = new Map();

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body, status, origin, allowedOrigins) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin, allowedOrigins)
    }
  });
}

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function normalizePhotoHash(hash) {
  const value = String(hash || '').toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(value)) return '';
  return value;
}

function authMessage(address, timestamp, photoHash, mimeType, size) {
  return [
    'ReefLedger photo upload',
    `Address: ${address.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
    `SHA256: ${photoHash}`,
    `MIME: ${mimeType}`,
    `Size: ${size}`
  ].join('\n');
}

function pruneMap(map, now) {
  for (const [key, exp] of map.entries()) {
    if (exp <= now) map.delete(key);
  }
}

function markSignatureUsed(signature) {
  const now = Date.now();
  pruneMap(usedSignatures, now);
  if (usedSignatures.has(signature)) return false;
  usedSignatures.set(signature, now + AUTH_MAX_AGE_SEC * 1000);
  return true;
}

function rateLimit(key, limit) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

function sanitizeFilename(name) {
  const base = String(name || 'reef-evidence')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
  return base || 'reef-evidence.jpg';
}

export default {
  async fetch(request, env) {
    const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (origin && !allowedOrigins.includes(origin)) {
        return new Response('Origin not allowed', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigins) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'reefledger-upload' }, 200, origin, allowedOrigins);
    }

    if (request.method !== 'POST' || url.pathname !== '/sign-upload') {
      return json({ error: 'Not found' }, 404, origin, allowedOrigins);
    }

    if (!origin || !allowedOrigins.includes(origin)) {
      return json({ error: 'Origin not allowed' }, 403, origin, allowedOrigins);
    }

    if (!env.PINATA_JWT) {
      return json({ error: 'Upload service is not configured' }, 500, origin, allowedOrigins);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, origin, allowedOrigins);
    }

    const addressRaw = String(body.address || '');
    const timestamp = Number(body.timestamp);
    const signature = String(body.signature || '');
    const mimeType = String(body.mimeType || '');
    const size = Number(body.size);
    const photoHash = normalizePhotoHash(body.photoHash);
    const filename = sanitizeFilename(body.filename);

    if (!isAddress(addressRaw)) {
      return json({ error: 'Invalid wallet address' }, 400, origin, allowedOrigins);
    }
    const address = getAddress(addressRaw);

    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > AUTH_MAX_AGE_SEC) {
      return json({ error: 'Upload authorization expired. Try again.' }, 401, origin, allowedOrigins);
    }
    if (!signature.startsWith('0x') || signature.length < 130) {
      return json({ error: 'Missing wallet signature' }, 401, origin, allowedOrigins);
    }
    if (!photoHash) {
      return json({ error: 'Missing photo SHA-256 hash' }, 400, origin, allowedOrigins);
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return json({ error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }, 400, origin, allowedOrigins);
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_PHOTO_BYTES) {
      return json({ error: 'Photo must be between 1 byte and 5 MB.' }, 400, origin, allowedOrigins);
    }

    let recovered;
    try {
      recovered = verifyMessage(authMessage(address, timestamp, photoHash, mimeType, size), signature);
    } catch {
      return json({ error: 'Invalid wallet signature' }, 401, origin, allowedOrigins);
    }
    if (getAddress(recovered) !== address) {
      return json({ error: 'Signature does not match wallet' }, 401, origin, allowedOrigins);
    }

    if (!markSignatureUsed(signature)) {
      return json({ error: 'Upload authorization already used' }, 401, origin, allowedOrigins);
    }

    const ip = clientIp(request);
    const ipLimit = rateLimit(`ip:${ip}`, RATE_LIMIT_IP);
    if (!ipLimit.ok) {
      return json(
        { error: `Too many upload requests from this network. Retry in ~${ipLimit.retryAfterSec}s.` },
        429,
        origin,
        allowedOrigins
      );
    }
    const walletLimit = rateLimit(`wallet:${address.toLowerCase()}`, RATE_LIMIT_WALLET);
    if (!walletLimit.ok) {
      return json(
        { error: `Too many upload requests for this wallet. Retry in ~${walletLimit.retryAfterSec}s.` },
        429,
        origin,
        allowedOrigins
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const signRes = await fetch('https://uploads.pinata.cloud/v3/files/sign', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PINATA_JWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: nowSec,
        expires: SIGNED_URL_TTL_SEC,
        filename,
        allow_mime_types: [...ALLOWED_MIME],
        max_file_size: MAX_PHOTO_BYTES,
        keyvalues: {
          app: 'reefledger',
          uploader: address.toLowerCase(),
          sha256: photoHash
        }
      })
    });

    let signBody;
    try {
      signBody = await signRes.json();
    } catch {
      signBody = null;
    }

    if (!signRes.ok || !signBody?.data) {
      const detail = signBody?.error?.message || signBody?.message || signRes.statusText;
      return json({ error: `Could not create upload URL: ${detail}` }, 502, origin, allowedOrigins);
    }

    const gateway = String(env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/');
    return json(
      {
        uploadUrl: signBody.data,
        expiresIn: SIGNED_URL_TTL_SEC,
        gateway: gateway.endsWith('/') ? gateway : `${gateway}/`
      },
      200,
      origin,
      allowedOrigins
    );
  }
};
