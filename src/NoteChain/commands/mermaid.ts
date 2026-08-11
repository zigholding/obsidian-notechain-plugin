import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_mermaid_flowchart_link = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_link',
    name: plugin.strings.cmd_mermaid_flowchart_link,
	icon:'file-heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.get_flowchart(null,2);\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

export const cmd_mermaid_flowchart_folder = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_folder',
    name: plugin.strings.cmd_mermaid_flowchart_folder,
	icon:'folder-heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.flowchart_folder(null,'Folder');\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

export const cmd_mermaid_flowchart_auto = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_auto',
    name: plugin.strings.cmd_mermaid_flowchart_auto,
	icon:'heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.get_mehrmaid_graph(null,4,'mermaid');\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

