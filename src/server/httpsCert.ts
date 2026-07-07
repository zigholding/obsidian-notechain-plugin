let fs = require('fs');
let path = require('path');
let os = require('os');
let crypto = require('crypto');
let selfsigned = require('selfsigned');

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

function buildAltNames(): Array<{ type: number; value?: string; ip?: string }> {
    const altNames: Array<{ type: number; value?: string; ip?: string }> = [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
    ];
    for (const list of Object.values(os.networkInterfaces()) as Array<
        Array<{ family?: string; internal?: boolean; address?: string }> | undefined
    >) {
        for (const iface of list || []) {
            const family = String(iface.family || '');
            if ((family === 'IPv4' || family === '4') && !iface.internal && iface.address) {
                altNames.push({ type: 7, ip: iface.address });
            }
        }
    }
    return altNames;
}

/** 自签 TLS 证书（localhost + 局域网 IP），供 Note-Chain HTTPS 服务 */
export async function ensureSelfSignedCert(tlsDir: string): Promise<{ key: string; cert: string }> {
    const keyPath = path.join(tlsDir, 'key.pem');
    const certPath = path.join(tlsDir, 'cert.pem');
    const metaPath = path.join(tlsDir, 'meta.json');

    const altNames = buildAltNames();
    const sansKey = altNames
        .map((a) => (a.type === 2 ? `d:${a.value}` : `i:${a.ip}`))
        .sort()
        .join(',');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(metaPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.sansKey === sansKey) {
                const key = fs.readFileSync(keyPath, 'utf8');
                const cert = fs.readFileSync(certPath, 'utf8');
                if (key.includes('BEGIN PRIVATE KEY') && cert.includes('BEGIN CERTIFICATE')) {
                    return { key, cert };
                }
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
    console.log('[note-chain] generated self-signed TLS cert:', tlsDir);
    return { key: pems.private, cert: pems.cert };
}
