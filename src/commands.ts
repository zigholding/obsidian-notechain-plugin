
import NoteChainPlugin from '../main';

import { addNoteChainCommands } from 'src/NoteChain/commands';
import { addWebViewerLLMCommands } from 'src/WebViewerLLM/commands';

export function addCommands(plugin:NoteChainPlugin) {
	addNoteChainCommands(plugin);
	addWebViewerLLMCommands(plugin);
}

