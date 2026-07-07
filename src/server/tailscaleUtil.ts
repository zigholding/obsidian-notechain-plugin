export interface TailscaleSelfInfo {
    dnsName: string;
    ipv4: string;
}

function runTailscaleStatusJson(): string | null {
    const { execSync } = require('child_process');
    const candidates = ['tailscale'];
    if (process.platform === 'win32') {
        candidates.push(
            'C:\\Program Files\\Tailscale\\tailscale.exe',
            `${process.env['ProgramFiles'] || 'C:\\Program Files'}\\Tailscale\\tailscale.exe`,
        );
    }
    for (const cmd of candidates) {
        try {
            return execSync(`"${cmd}" status --json`, {
                encoding: 'utf8',
                timeout: 5000,
                stdio: ['pipe', 'pipe', 'ignore'],
                windowsHide: true,
                shell: true,
            });
        } catch {
            /* try next */
        }
    }
    return null;
}

/** 读取本机 Tailscale MagicDNS 与 IPv4（需 tailscale CLI） */
export function getTailscaleSelfInfo(): TailscaleSelfInfo | null {
    try {
        const raw = runTailscaleStatusJson();
        if (!raw) return null;
        const j = JSON.parse(raw);
        const dnsName = String(j?.Self?.DNSName || '')
            .replace(/\.$/, '')
            .trim();
        let ipv4 = '';
        for (const ip of j?.Self?.TailscaleIPs || []) {
            const s = String(ip);
            if (!s.includes(':')) {
                ipv4 = s;
                break;
            }
        }
        if (!dnsName && !ipv4) return null;
        return { dnsName, ipv4 };
    } catch {
        return null;
    }
}
