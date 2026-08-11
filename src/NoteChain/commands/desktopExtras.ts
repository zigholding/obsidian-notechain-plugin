import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

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
		const wv = (plugin.app as any).internalPlugins?.getEnabledPluginById?.('webviewer');
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
		if ((plugin.app as any).isMobile) {
			new Notice('Save to computer is only available on desktop');
			return;
		}
		const baseUrl = plugin.httpServer.getBaseUrl(plugin.settings.notechain.httpServerHost);
		const content = await plugin.httpServer.getMCPSkillMarkdownAsync(baseUrl);
		try {
			const { dialog } = require('electron').remote;
			const result = await dialog.showSaveDialog({
				title: 'Save MCP Agent Skill (SKILL.md)',
				defaultPath: 'SKILL.md',
				filters: [
					{ name: 'Markdown', extensions: ['md'] },
					{ name: 'All Files', extensions: ['*'] }
				]
			});
			if (result.canceled || !result.filePath) return;
			const fs = require('fs');
			fs.writeFileSync(result.filePath, content, 'utf8');
			new Notice(`SKILL.md saved to ${result.filePath}`);
		} catch (e: any) {
			new Notice('Failed to save SKILL.md: ' + (e?.message ?? e));
		}
	}
});

