export interface TailscaleSelfInfo {
    dnsName: string;
    ipv4: string;
}

/** 不再调用 Tailscale CLI（社区审核禁止 child_process / 环境变量指纹）。 */
export function getTailscaleSelfInfo(): TailscaleSelfInfo | null {
    return null;
}
