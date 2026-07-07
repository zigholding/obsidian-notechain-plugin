let fs = require('fs');
let path = require('path');
let os = require('os');
let crypto = require('crypto');
let selfsigned = require('selfsigned');
import { getTailscaleSelfInfo } from './tailscaleUtil';

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

function isLoopbackIPv4(ip: string): boolean {
    return ip === '127.0.0.1' || ip.startsWith('127.');
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
    const altNames: SanEntry[] = [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
    ];
    const seenDns = new Set<string>(['localhost']);
    const seenIp = new Set<string>(['127.0.0.1']);

    const ts = getTailscaleSelfInfo();
    if (ts?.dnsName && !seenDns.has(ts.dnsName)) {
        seenDns.add(ts.dnsName);
        altNames.push({ type: 2, value: ts.dnsName });
    }
    if (ts?.ipv4 && !seenIp.has(ts.ipv4)) {
        seenIp.add(ts.ipv4);
        altNames.push({ type: 7, ip: ts.ipv4 });
    }

    for (const list of Object.values(os.networkInterfaces()) as Array<
        Array<{ family?: string; internal?: boolean; address?: string }> | undefined
    >) {
        for (const iface of list || []) {
            const family = String(iface.family || '');
            const address = String(iface.address || '').trim();
            if ((family !== 'IPv4' && family !== '4') || !address || isLoopbackIPv4(address)) {
                continue;
            }
            if (seenIp.has(address)) continue;
            seenIp.add(address);
            altNames.push({ type: 7, ip: address });
        }
    }
    return altNames;
}

function sansKeyFromAltNames(altNames: SanEntry[]): string {
    return altNames
        .map((a) => (a.type === 2 ? `d:${a.value}` : `i:${a.ip}`))
        .sort()
        .join(',');
}

/** 自签 TLS 证书（localhost + 本机 IPv4 + Tailscale MagicDNS） */
export async function ensureSelfSignedCert(tlsDir: string): Promise<{ key: string; cert: string }> {
    const keyPath = path.join(tlsDir, 'key.pem');
    const certPath = path.join(tlsDir, 'cert.pem');
    const metaPath = path.join(tlsDir, 'meta.json');

    const altNames = buildAltNames();
    const sansKey = sansKeyFromAltNames(altNames);

    if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(metaPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const key = fs.readFileSync(keyPath, 'utf8');
            const cert = fs.readFileSync(certPath, 'utf8');
            if (
                meta.sansKey === sansKey &&
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

    const pems = await selfsigned.generate([{ name: 'commonName', value: 'NoteChain' }], {
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
    const dns = altNames.filter((a) => a.type === 2).map((a) => a.value);
    const ips = altNames.filter((a) => a.type === 7).map((a) => a.ip);
    console.log('[note-chain] generated self-signed TLS cert:', tlsDir);
    console.log('[note-chain] TLS cert SAN DNS:', dns.join(', '));
    console.log('[note-chain] TLS cert SAN IPs:', ips.join(', '));
    return { key: pems.private, cert: pems.cert };
}
