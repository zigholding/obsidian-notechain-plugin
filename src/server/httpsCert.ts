import { desktopNodeOrThrow, type NodeCryptoModule, type NodeFsModule, type NodePathModule } from '../obsidian-app';
import { isRecord } from '../ts-helpers';

const fs = desktopNodeOrThrow<NodeFsModule>('fs');
const path = desktopNodeOrThrow<NodePathModule>('path');
const crypto = desktopNodeOrThrow<NodeCryptoModule>('crypto');

/** Lazy-load: selfsigned touches nodeCrypto.webcrypto at require-time (breaks Obsidian mobile). */
interface SelfsignedPems {
	private: string;
	cert: string;
}

interface SelfsignedLib {
	generate(
		attrs: Array<{ name: string; value: string }>,
		options: Record<string, unknown>,
	): SelfsignedPems | Promise<SelfsignedPems>;
}

/** Bundled via static `require` (esbuild). Do not `desktopNode('selfsigned')` — that looks up plugin node_modules at runtime. Call only on desktop: package init uses Node webcrypto. */
function getSelfsigned(): SelfsignedLib {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- npm package must be bundled; desktopNode looks up missing plugin node_modules
	const lib = require('selfsigned') as SelfsignedLib;
	if (!lib || typeof lib.generate !== 'function') {
		throw new Error('selfsigned unavailable');
	}
	return lib;
}

function normalizeCertFingerprint(fp: string): string {
    return String(fp || '').replace(/:/g, '').toUpperCase();
}

/** 读取 Note-Chain 自签证书 SHA-256 指纹（供 WebView 校验） */
export function readNoteChainCertFingerprint(tlsDir: string): string | null {
    const certPath = path.join(tlsDir, 'cert.pem');
    if (!fs.existsSync(certPath)) return null;
    try {
        const pem = fs.readFileSync(certPath, 'utf8');
        const b64 = pem
            .replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\s/g, '');
        const der = Buffer.from(b64, 'base64');
        return crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
    } catch {
        return null;
    }
}

export function certFingerprintsMatch(a: string, b: string): boolean {
    return normalizeCertFingerprint(a) === normalizeCertFingerprint(b);
}

type SanEntry = { type: number; value?: string; ip?: string };

function certCoversAltNames(certPem: string, altNames: SanEntry[]): boolean {
    try {
        const x509 = new crypto.X509Certificate(certPem);
        const san = String(x509.subjectAltName || '');
        for (const a of altNames) {
            if (a.type === 2 && a.value && !san.includes(`DNS:${a.value}`)) {
                return false;
            }
            if (a.type === 7 && a.ip && !san.includes(`IP Address:${a.ip}`)) {
                return false;
            }
        }
        return true;
    } catch {
        return false;
    }
}

function buildAltNames(): SanEntry[] {
    return [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
    ];
}

function sansKeyFromAltNames(altNames: SanEntry[]): string {
    return altNames
        .map((a) => (a.type === 2 ? `d:${a.value}` : `i:${a.ip}`))
        .sort()
        .join(',');
}

/** 自签 TLS 证书（仅 localhost / 127.0.0.1，避免采集网卡/主机身份） */
export async function ensureSelfSignedCert(tlsDir: string): Promise<{ key: string; cert: string }> {
    const keyPath = path.join(tlsDir, 'key.pem');
    const certPath = path.join(tlsDir, 'cert.pem');
    const metaPath = path.join(tlsDir, 'meta.json');

    const altNames = buildAltNames();
    const sansKey = sansKeyFromAltNames(altNames);

    if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(metaPath)) {
        try {
            const metaRaw: unknown = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const key = fs.readFileSync(keyPath, 'utf8');
            const cert = fs.readFileSync(certPath, 'utf8');
            if (
                isRecord(metaRaw) &&
                metaRaw.sansKey === sansKey &&
                key.includes('BEGIN PRIVATE KEY') &&
                cert.includes('BEGIN CERTIFICATE') &&
                certCoversAltNames(cert, altNames)
            ) {
                return { key, cert };
            }
        } catch {
            /* regenerate */
        }
    }

    fs.mkdirSync(tlsDir, { recursive: true });
    const notAfterDate = new Date();
    notAfterDate.setDate(notAfterDate.getDate() + 825);

    const pems = await getSelfsigned().generate([{ name: 'commonName', value: 'NoteChain' }], {
        keySize: 2048,
        algorithm: 'sha256',
        notAfterDate,
        extensions: [{ name: 'subjectAltName', altNames }],
    });

    if (!pems?.private || !pems?.cert) {
        throw new Error('TLS certificate generation failed (empty key or cert)');
    }

    fs.writeFileSync(keyPath, pems.private, 'utf8');
    fs.writeFileSync(certPath, pems.cert, 'utf8');
    fs.writeFileSync(
        metaPath,
        JSON.stringify({ sansKey, generatedAt: new Date().toISOString() }, null, 2),
        'utf8',
    );
    return { key: pems.private, cert: pems.cert };
}
