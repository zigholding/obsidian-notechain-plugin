import { App } from 'obsidian';
import { certFingerprintsMatch, readNoteChainCertFingerprint } from './httpsCert';

const installedKeys = new Set<string>();

/** Obsidian WebViewer / NCView 使用的 Electron session partition */
export function getWebViewerPartition(app: App): string {
    return `persist:vault-${(app as any).appId}`;
}

function isLocalNoteChainHost(hostname: string): boolean {
    const h = String(hostname || '').toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
    return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

/** 本机 HTTP 端口：与 HTTPS 同时开启时为 httpsPort+1，仅 HTTP 时为 httpsPort */
export function getNoteChainLocalHttpPort(httpsPort: number, httpsAlsoOn = true): number {
    return httpsAlsoOn ? httpsPort + 1 : httpsPort;
}

export function getObsidianOldBuddyUrl(httpsPort: number, httpsAlsoOn = true): string {
    return `http://127.0.0.1:${getNoteChainLocalHttpPort(httpsPort, httpsAlsoOn)}/oldbuddy`;
}

/** 将 Note-Chain 本机 HTTPS 地址转为 WebViewer 可用的 HTTP 地址 */
export function toWebViewerUrl(url: string, httpsPort: number, httpsAlsoOn = true): string {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !isLocalNoteChainHost(u.hostname)) return url;
        const p = u.port ? Number(u.port) : 443;
        if (p !== httpsPort) return url;
        const local = new URL(url);
        local.protocol = 'http:';
        local.hostname = '127.0.0.1';
        local.port = String(getNoteChainLocalHttpPort(httpsPort, httpsAlsoOn));
        return local.toString();
    } catch {
        return url;
    }
}

function getElectronSession(partition: string): any {
    try {
        const electron = require('electron');
        const fromPartition =
            electron.session?.fromPartition?.bind(electron.session) ||
            electron.remote?.session?.fromPartition?.bind(electron.remote?.session);
        return fromPartition ? fromPartition(partition) : null;
    } catch {
        return null;
    }
}

function requestPort(request: any, defaultPort: number): number {
    const raw = request?.port;
    if (raw == null || raw === '') return defaultPort;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : defaultPort;
}

/**
 * 尝试让 webview 信任自签 HTTPS（Obsidian 新版可能无效；优先用 getObsidianOldBuddyUrl）。
 */
export function installWebviewTlsTrust(partition: string, port: number, tlsDir: string): void {
    const installKey = `${partition}:${port}`;
    if (installedKeys.has(installKey)) return;

    const expectedFp = readNoteChainCertFingerprint(tlsDir);
    if (!expectedFp) return;

    try {
        const ses = getElectronSession(partition);
        if (!ses?.setCertificateVerifyProc) return;

        ses.setCertificateVerifyProc((request: any, callback: (result: number) => void) => {
            const hostname = String(request?.hostname || '');
            const reqPort = requestPort(request, port);

            if (reqPort !== port || !isLocalNoteChainHost(hostname)) {
                callback(-3);
                return;
            }

            const cert = request?.certificate;
            const fp = cert?.fingerprint;
            if (fp && certFingerprintsMatch(fp, expectedFp)) {
                callback(0);
                return;
            }

            const subject = String(cert?.subjectName || cert?.subject?.commonName || '');
            const issuer = String(cert?.issuerName || cert?.issuer?.commonName || '');
            if (subject.includes('NoteChain') || issuer.includes('NoteChain')) {
                callback(0);
                return;
            }

            callback(-3);
        });

        installedKeys.add(installKey);
        console.log('[note-chain] webview TLS trust installed for', partition, 'port', port);
    } catch (e) {
        console.warn('[note-chain] webview TLS trust setup failed:', e);
    }
}

export function isNoteChainServerUrl(url: string, port: number, httpsAlsoOn = true): boolean {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        const p = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
        const httpsPort = port;
        const localPort = getNoteChainLocalHttpPort(port, httpsAlsoOn);
        if (p !== httpsPort && p !== localPort) return false;
        return isLocalNoteChainHost(u.hostname);
    } catch {
        return false;
    }
}
