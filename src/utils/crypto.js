import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_DIR = path.join(process.cwd(), 'keys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'server_private.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'server_public.pem');

let serverKeys = null;

/**
 * Retrieves the server's RSA keypair, generating a new one if it doesn't exist.
 * @returns {Object} { privateKey, publicKey }
 */
export const getServerKeypair = () => {
    if (serverKeys) return serverKeys;

    // 1. Check Environment Variables (Preferred for Serverless/Production)
    if (process.env.SERVER_PRIVATE_KEY && process.env.SERVER_PUBLIC_KEY) {
        serverKeys = {
            privateKey: process.env.SERVER_PRIVATE_KEY.replace(/\\n/g, '\n'),
            publicKey: process.env.SERVER_PUBLIC_KEY.replace(/\\n/g, '\n')
        };
        return serverKeys;
    }

    // 2. Check Filesystem (Fallback for Local Development)
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        try {
            const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
            serverKeys = { privateKey, publicKey };
            return serverKeys;
        } catch (e) {
            console.warn('Failed to read keys from disk:', e.message);
        }
    }

    // 3. Generate Keys (Last Resort)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // 4. Attempt to Persist (Will fail gracefully in read-only environments)
    try {
        if (!fs.existsSync(KEY_DIR)) {
            fs.mkdirSync(KEY_DIR, { recursive: true });
        }
        fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
        fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
    } catch (e) {
        // Only log disk write failures in non-production environments
        if (process.env.NODE_ENV !== 'production') {
            console.warn('Could not persist keys to disk (expected in serverless):', e.message);
        }
    }

    serverKeys = { privateKey, publicKey };
    return serverKeys;
};

/**
 * Signs a payload using the server's private key with SHA256 and PSS padding.
 * @param {Object|string} payload - The data to sign.
 * @returns {string} Hex-encoded signature.
 */
export const signPayload = (payload) => {
    const { privateKey } = getServerKeypair();

    // Deterministic stringification to match daemon's verification logic
    const data = (typeof payload === 'object' && payload !== null)
        ? JSON.stringify(payload, Object.keys(payload).sort())
        : String(payload);

    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();

    const signature = sign.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX
    });

    return signature.toString('hex');
};
