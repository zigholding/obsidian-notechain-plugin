import {
	Notice
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';
import { isMobileApp, obsidianApp, desktopNode, type WebviewerInternalPlugin, type NodeFsModule } from '../../obsidian-app';
import { errorMessage } from '../../ts-helpers';

export const cmd_open_oldbuddy = (plugin: NoteChainPlugin) => ({
	id: 'open-oldbuddy-webviewer',
	name: plugin.strings.cmd_open_oldbuddy,
	icon: 'message-square',
	callback: async () => {
		if (!plugin.httpServer?.isHttpRunning()) {
			new Notice(plugin.strings.cmd_open_oldbuddy_http_off);
			return;
		}
		const url = plugin.httpServer.getObsidianOldBuddyUrl();
		const wv = obsidianApp(plugin.app).internalPlugins?.getEnabledPluginById?.('webviewer') as
			WebviewerInternalPlugin | undefined;
		if (wv?.openUrl) {
			await wv.openUrl(url, true);
			return;
		}
		await plugin.chain.open_note_in_view(url);
	},
});

export const cmd_generate_mcp_skill = (plugin: NoteChainPlugin) => ({
	id: 'generate-mcp-skill',
	name: 'Generate MCP Agent Skill (SKILL.md)',
	icon: 'file-code',
	callback: async () => {
		if (!plugin.httpServer) {
			new Notice('HTTP Server not initialized');
			return;
		}
		if (isMobileApp(plugin.app)) {
			new Notice('Save to computer is only available on desktop');
			return;
		}
		const baseUrl = plugin.httpServer.getBaseUrl(plugin.settings.notechain.httpServerHost);
		const content = await plugin.httpServer.getMCPSkillMarkdownAsync(baseUrl);
		try {
			const electron = desktopNode<{ remote?: { dialog?: { showSaveDialog: (opts: Record<string, unknown>) => Promise<{ canceled?: boolean; filePath?: string }> } } }>('electron');
			const dialog = electron?.remote?.dialog;
			if (!dialog) throw new Error('electron dialog unavailable');
			const result = await dialog.showSaveDialog({
				title: 'Save MCP Agent Skill (SKILL.md)',
				defaultPath: 'SKILL.md',
				filters: [
					{ name: 'Markdown', extensions: ['md'] },
					{ name: 'All Files', extensions: ['*'] }
				]
			});
			if (result.canceled || !result.filePath) return;
			const fs = desktopNode<NodeFsModule>('fs');
			if (!fs) throw new Error('fs unavailable');
			fs.writeFileSync(result.filePath, content, 'utf8');
			new Notice(`SKILL.md saved to ${result.filePath}`);
		} catch (e: unknown) {
			new Notice('Failed to save SKILL.md: ' + errorMessage(e));
		}
	}
});

