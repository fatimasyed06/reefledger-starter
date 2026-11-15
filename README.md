# ReefLedger — Monad Blitz starter

A small, public, append-only reef-damage reporting demo on **Monad Testnet**. Includes a Solidity contract and a single static HTML page. **No npm setup required.**

## 1. Deploy contract
1. Visit https://remix.ethereum.org/ and create `ReefLedger.sol`.
2. Paste contents of `contracts/ReefLedger.sol`.
3. Compile with Solidity version **0.8.24** or compatible version >=0.8.24.
4. In Deploy & Run, choose **Injected Provider** (browser wallet connected to **Monad Testnet**).
5. Get test MON from https://faucet.monad.xyz if required.
6. Deploy and **copy the contract address**. No constructor arguments needed.

Monad Testnet: Chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadvision.com/`.

## 2. Connect website
Open `index.html` in Cursor and change:

`const CONTRACT_ADDRESS = 'PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE';`

to the actual deployed address. Save it.

## 3. Run frontend
Open a terminal in the directory containing `index.html` and run:

`python3 -m http.server 3000`

Open http://localhost:3000 in your browser. The app uses CDN assets and requires an internet connection and browser wallet.

## 4. Submit a demo observation
- Connect your wallet.
- Enter **fictional** coordinates (or an already public and nonsensitive location); choose a damage type.
- Upload a photo to compute its SHA-256 fingerprint **or** provide a public photo URL.
- Submit and approve the Testnet transaction.
- The report should appear on the map. Anyone can inspect the same on-chain record.

**IMPORTANT:** Photo files you select are only hashed in-browser; the app DOES NOT upload or preserve the file. Paste a separately hosted public photo URL if you need the photo to be visible to others. The `photoHash` validates file bytes only if another viewer has the same file to compare. If you paste only a URL, the hash is zero, and the URL is not cryptographically verified. Photos may disappear from external hosts.

## 5. Publish
- Push these files to a **new public GitHub repo** created for this hackathon.
- GitHub Pages: Repository settings -> Pages -> Deploy from branch -> main / root.
- Your URL will be `https://YOUR-USERNAME.github.io/YOUR-REPO/` once published.
- Test the live website and the on-chain report flow from two wallets if possible.

## Scope limitations
- This is a public **unverified citizen-observation** registry, NOT authoritative science.
- Users can submit incorrect locations or classifications. A blockchain doesn't verify claims.
- Coordinates, descriptions, URLs and reporters' addresses become permanent public data. Use mock data in the hackathon.
- No identities or Sybil prevention, no AI, no scientist review, no photo hosting, no moderation, and no scientific quality control are implemented.
- The ABI in the HTML is handwritten and matches the supplied contract. If you change the function signatures, update the frontend ABI too.
