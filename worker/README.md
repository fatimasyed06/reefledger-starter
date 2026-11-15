# ReefLedger upload worker

Cloudflare Worker that keeps your permanent Pinata JWT as a secret and issues short-lived Pinata upload URLs to the ReefLedger frontend.

## What it does

1. Accepts a wallet-signed authorization from the browser
2. Rate-limits by IP and wallet address
3. Asks Pinata for a 60-second presigned upload URL restricted to images ≤ 5 MB
4. Returns that URL to the browser (never the permanent JWT)

## One-time setup

1. Install Node.js 18+ if needed.
2. From this folder:

```bash
cd worker
npm install
npx wrangler login
```

3. Put your permanent Pinata JWT in Cloudflare (not in git):

```bash
npx wrangler secret put PINATA_JWT
```

Paste the JWT when prompted.

4. Edit `wrangler.toml` `ALLOWED_ORIGINS` to include every site that may call the worker, comma-separated, for example:

```toml
ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,https://fatimasyed06.github.io"
```

If the GitHub Pages app lives under a repo path, the Origin header is still only the host (`https://USER.github.io`), not the path.

5. Deploy:

```bash
npm run deploy
```

Copy the printed `*.workers.dev` URL.

6. In `../index.html`, set:

```js
const UPLOAD_API_BASE = 'https://YOUR_WORKER.workers.dev';
```

7. Local frontend test: keep `python3 -m http.server 3000` at the repo root. For a local worker:

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars with PINATA_JWT
npm run dev
```

Then point `UPLOAD_API_BASE` at the local wrangler URL (usually `http://127.0.0.1:8787`).

## Security notes

- Do not put `PINATA_JWT` in frontend code, localStorage, GitHub, or Pages files.
- `.dev.vars` is gitignored and for local wrangler only.
- Uploads require a fresh MetaMask personal signature that includes the photo SHA-256, MIME type, and size.
- CORS origin allowlisting and per-IP / per-wallet rate limits are enabled.
- After changing `ALLOWED_ORIGINS` or worker code, run `npm run deploy` again.

### Known limitation before unrestricted public uploads

**Cross-instance rate limiting and signature-replay protection are not durable.**

The Worker stores used signatures and rate-limit counters in isolate-local memory. Cloudflare may run many isolates across regions, so:

- the same wallet signature can sometimes obtain more than one Pinata upload URL
- per-IP / per-wallet limits can be bypassed under parallel or multi-region traffic

This is acceptable for a controlled hackathon demo, but **must be fixed before enabling unrestricted public uploads**. Prefer Cloudflare KV or Durable Objects (or an equivalent shared store) for:

1. one-time signature / nonce tracking
2. durable per-IP and per-wallet rate limits

Also note: a valid upload signature authorizes Pinata upload only; it does not require a successful Monad transaction, so wallet Sybil traffic can still consume Pinata quota.
