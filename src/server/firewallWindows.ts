/** Windows 入站防火墙：不再自动执行 netsh（社区审核禁止 child_process）。 */
export function ensureWindowsFirewallPorts(_ports: number[]): void {
    /* LAN / Tailscale 若不通，需用户自行添加入站规则。 */
}
