import { App, Platform } from 'obsidian';
import { desktopNode, isMobileApp, type NodeChildProcessModule } from '../obsidian-app';

const EXEC_MAX_BUFFER = 50 * 1024 * 1024;

/** Windows cmd 默认是 OEM 代码页（中文系统多为 GBK），按 UTF-8 解会乱码。 */
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
			cp.exec(cmd, { maxBuffer: EXEC_MAX_BUFFER, encoding: 'buffer' }, (err, stdout) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(decodeExecOutput(stdout));
			});
		});
	}
}
