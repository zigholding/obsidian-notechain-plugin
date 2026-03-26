import type NoteChainPlugin from '../../main';
import { strings } from './strings';

const cmd_chat_sequence = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_chat_sequence',
	name: strings.cmd_chat_sequence,
	callback: async () => {
		await plugin.webviewerllm.cmd_chat_sequence();
	},
});

const cmd_chat_sequence_stop = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_chat_sequence_stop',
	name: strings.cmd_chat_sequence_stop,
	callback: async () => {
		plugin.webviewerllm.auto_chat = false;
	},
});

const cmd_open_new_llm = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_open_new_llm',
	name: strings.cmd_open_new_llm,
	callback: async () => {
		const wv = plugin.webviewerllm;
		const hpage = await plugin.easyapi.dialog_suggest(
			wv.basellms.map((x) => x.name),
			wv.basellms.map((x) => x.homepage)
		);
		if (hpage) {
			await wv.basewv.open_homepage(hpage, -1);
		}
	},
});

const cmd_chat_every_llms = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_chat_every_llms',
	name: strings.cmd_chat_every_llms,
	callback: async () => {
		await plugin.webviewerllm.cmd_chat_every_llms();
	},
});

const cmd_chat_first_llms = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_chat_first_llms',
	name: strings.cmd_chat_first_llms,
	callback: async () => {
		await plugin.webviewerllm.cmd_chat_first_llms();
	},
});

const cmd_paste_last_active_llm = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_paste_last_active_llm',
	name: strings.cmd_paste_last_active_llm,
	callback: async () => {
		await plugin.webviewerllm.cmd_paste_last_active_llm();
	},
});

const cmd_probe_active_llm_elements = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_probe_active_llm_elements',
	name: strings.cmd_probe_active_llm_elements,
	callback: async () => {
		await plugin.webviewerllm.cmd_probe_active_llm_elements();
	},
});

const cmd_copy_active_llm_profile_snippet = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_copy_active_llm_profile_snippet',
	name: strings.cmd_copy_active_llm_profile_snippet,
	callback: async () => {
		await plugin.webviewerllm.cmd_copy_active_llm_profile_snippet();
	},
});

const cmd_paste_ai_contents_as_list2tab = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_paste_ai_contents_as_list2tab',
	name: strings.cmd_paste_ai_contents_as_list2tab,
	callback: async () => {
		await plugin.webviewerllm.cmd_paste_to_markdown('list2tab');
	},
});

const cmd_paste_ai_contents_as_list2card = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_paste_ai_contents_as_list2card',
	name: strings.cmd_paste_ai_contents_as_list2card,
	callback: async () => {
		await plugin.webviewerllm.cmd_paste_to_markdown('list2card');
	},
});

const cmd_chat_with_target_tfile = (plugin: NoteChainPlugin) => ({
	id: 'note-chain-wv-cmd_chat_with_target_tfile',
	name: strings.cmd_chat_with_target_tfile,
	hotkeys: [{ modifiers: ['Alt'], key: 'F' }],
	callback: async () => {
		await plugin.webviewerllm.cmd_chat_with_target_tfile();
	},
});

const commandBuilders: Array<(p: NoteChainPlugin) => ReturnType<typeof cmd_open_new_llm>> = [];

const commandBuildersDesktop: Array<(p: NoteChainPlugin) => ReturnType<typeof cmd_open_new_llm>> = [
	cmd_open_new_llm,
	cmd_chat_first_llms,
	cmd_chat_every_llms,
	cmd_chat_with_target_tfile,
	cmd_chat_sequence,
	cmd_chat_sequence_stop,
	cmd_paste_last_active_llm,
	cmd_probe_active_llm_elements,
	cmd_copy_active_llm_profile_snippet,
	cmd_paste_ai_contents_as_list2tab,
	cmd_paste_ai_contents_as_list2card,
];

export function addWebViewerLLMCommands(plugin: NoteChainPlugin) {
	commandBuilders.forEach((c) => {
		plugin.addCommand(c(plugin));
	});
	if ((plugin.app as any).isMobile == false) {
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
