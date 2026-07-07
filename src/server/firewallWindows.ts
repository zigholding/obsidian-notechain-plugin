/** Windows 入站防火墙：Tailscale / 局域网访问端口 */
export function ensureWindowsFirewallPorts(ports: number[]): void {
    if (process.platform !== 'win32' || !ports.length) return;

    const { execSync } = require('child_process');
    const failed: number[] = [];

    for (const port of ports) {
        const name = `Note-Chain ${port}`;
        try {
            execSync(`netsh advfirewall firewall show rule name="${name}"`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                windowsHide: true,
            });
            continue;
        } catch {
            /* rule missing */
        }
        try {
            execSync(
                `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port}`,
                { stdio: 'ignore', windowsHide: true },
            );
            console.log(`[note-chain] firewall inbound rule added: TCP ${port}`);
        } catch {
            failed.push(port);
        }
    }

    if (!failed.length) return;

    const cmds = failed
        .map(
            (p) =>
                `netsh advfirewall firewall add rule name="Note-Chain ${p}" dir=in action=allow protocol=TCP localport=${p}`,
        )
        .join('\n');
    console.warn(
        `[note-chain] firewall: 需要管理员权限才能自动放行端口 ${failed.join(', ')}。\n` +
            `请在「PowerShell(管理员)」中执行一次：\n${cmds}\n` +
            `（Obsidian 已有 obsidian.exe 入站规则时，局域网可能仍可访问；Tailscale 远程若不通，建议执行上述命令。）`,
    );
}
