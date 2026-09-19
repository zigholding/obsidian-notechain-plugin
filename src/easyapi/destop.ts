import { App, Platform } from 'obsidian';
import {
	desktopNode,
	isMobileApp,
	type NodeChildProcessExecCallback,
	type NodeChildProcessModule,
	type NodeFsModule,
	type NodePathModule,
} from '../obsidian-app';

const EXEC_MAX_BUFFER = 50 * 1024 * 1024;
const EXEC_OPTS = { maxBuffer: EXEC_MAX_BUFFER, encoding: 'buffer' as const, windowsHide: true };

/** Windows PowerShell 5.1：JSON 用 Unicode，脚本本身只有 ASCII。 */
const PS_RUNNER = [
	'param([Parameter(Mandatory=$true)][string]$JsonPath)',
	'$env:PYTHONUTF8 = "1"',
	'$env:PYTHONIOENCODING = "utf-8"',
	'try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}',
	'$spec = (Get-Content -LiteralPath $JsonPath -Raw -Encoding Unicode) | ConvertFrom-Json',
	'if ($spec.shell) {',
	'  & cmd.exe /d /s /c $spec.cmd',
	'  exit $LASTEXITCODE',
	'}',
	'$exe = [string]$spec.file',
	'$arglist = @()',
	'foreach ($a in @($spec.args)) { $arglist += [string]$a }',
	'if ($arglist.Count -gt 0) { & $exe @arglist } else { & $exe }',
	'exit $LASTEXITCODE',
].join('\r\n');

function decodeExecOutput(data: string | Uint8Array): string {
	if (typeof data === 'string') return data;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		if (Platform.isWin) {
			try {
				return new TextDecoder('gb18030').decode(data);
			} catch { /* encoding not available */ }
		}
		return new TextDecoder('utf-8').decode(data);
	}
}

function splitCommandArgs(cmd: string): string[] {
	const args: string[] = [];
	let cur = '';
	let inQuote = false;
	for (const c of cmd) {
		if (c === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (!inQuote && (c === ' ' || c === '\t')) {
			if (cur.length > 0) {
				args.push(cur);
				cur = '';
			}
			continue;
		}
		cur += c;
	}
	if (cur.length > 0) args.push(cur);
	return args;
}

function usesShell(cmd: string): boolean {
	let inQuote = false;
	for (const c of cmd) {
		if (c === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (!inQuote && '|&<>^%\n'.includes(c)) return true;
	}
	return false;
}

function windowsExecSpec(cmd: string): { shell: true; cmd: string } | { file: string; args: string[] } {
	if (!usesShell(cmd)) {
		const parts = splitCommandArgs(cmd);
		const file = parts[0];
		if (file) return { file, args: parts.slice(1) };
	}
	return { shell: true, cmd };
}

function execWindowsViaPowershell(
	cp: NodeChildProcessModule,
	cmd: string,
	finish: NodeChildProcessExecCallback,
	reject: (err: Error) => void,
): void {
	const fs = desktopNode<NodeFsModule>('fs');
	const pathMod = desktopNode<NodePathModule>('path');
	const os = desktopNode<{ tmpdir?: () => string }>('os');
	if (!fs?.writeFileSync || !fs.unlinkSync || !pathMod?.join || typeof cp.execFile !== 'function') {
		reject(new Error('Windows exec helper is not available'));
		return;
	}
	const dir = os?.tmpdir?.() ?? 'C:\\Windows\\Temp';
	const id = `nc-exec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const jsonPath = pathMod.join(dir, `${id}.json`);
	const ps1Path = pathMod.join(dir, `${id}.ps1`);
	const cleanup = () => {
		try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
		try { fs.unlinkSync(ps1Path); } catch { /* ignore */ }
	};
	try {
		fs.writeFileSync(jsonPath, `\uFEFF${JSON.stringify(windowsExecSpec(cmd))}`, 'utf16le');
		fs.writeFileSync(ps1Path, PS_RUNNER, 'utf8');
	} catch (e) {
		cleanup();
		reject(e instanceof Error ? e : new Error('failed to write exec temp file'));
		return;
	}
	cp.execFile(
		'powershell.exe',
		['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, jsonPath],
		EXEC_OPTS,
		(err, stdout, stderr) => {
			cleanup();
			finish(err, stdout, stderr);
		},
	);
}

export class Destop {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	execAsync(cmd: string): Promise<string> {
		return new Promise((resolve, reject) => {
			if (isMobileApp(this.app)) {
				reject(new Error('execAsync is desktop only'));
				return;
			}
			const cp = desktopNode<NodeChildProcessModule>('child_process');
			if (typeof cp?.exec !== 'function') {
				reject(new Error('Node module "child_process" is not available'));
				return;
			}

			const finish: NodeChildProcessExecCallback = (err, stdout, stderr) => {
				if (!err) {
					resolve(decodeExecOutput(stdout));
					return;
				}
				const detail = decodeExecOutput(stderr);
				reject(new Error(detail ? `Command failed: ${cmd}\n${detail}` : (err.message || `Command failed: ${cmd}`)));
			};

			if (Platform.isWin) {
				execWindowsViaPowershell(cp, cmd, finish, reject);
				return;
			}

			const parts = !usesShell(cmd) ? splitCommandArgs(cmd) : [];
			if (parts.length > 0 && typeof cp.execFile === 'function') {
				const file = parts[0];
				if (file) {
					cp.execFile(file, parts.slice(1), EXEC_OPTS, finish);
					return;
				}
			}
			cp.exec(cmd, EXEC_OPTS, finish);
		});
	}
}
