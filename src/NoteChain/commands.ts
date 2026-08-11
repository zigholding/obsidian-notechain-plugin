import type NoteChainPlugin from '../plugin';

import { cmd_longform2notechain, cmd_longform4notechain } from './commands/longform';
import { cmd_open_notes_smarter, cmd_open_note, cmd_open_prev_note, cmd_open_next_note, cmd_reveal_note, cmd_open_and_reveal_note, cmd_open_prev_note_of_right_leaf, cmd_open_next_note_of_right_leaf } from './commands/navigation';
import { chain_insert_node, chain_set_seq_note, chain_move_up_node, chain_move_down_node, create_new_note } from './commands/chainOps';
import { cmd_sort_file_explorer, clear_inlinks, move_file_to_another_folder, replace_notes_with_regx, cmd_file_open_with_system_app, cmd_file_show_in_system_explorer, cmd_file_rename } from './commands/fileOps';
import { cmd_mermaid_flowchart_link, cmd_mermaid_flowchart_folder, cmd_mermaid_flowchart_auto } from './commands/mermaid';
import { cmd_toogle_css_block_in_note, cmd_set_frontmatter, cmd_pick_note_background_color, cmd_move_next_level, cmd_move_none_level, cmd_move_prev_level } from './commands/frontmatterLevel';
import { cmd_execute_template_modal, cmd_insert_command_id, cmd_open_note_in_modal, cmd_open_note_in_view, cmd_execut_current_note } from './commands/templatesViews';
import { cmd_open_oldbuddy, cmd_generate_mcp_skill } from './commands/desktopExtras';

const commandBuilders = [
	cmd_generate_mcp_skill,
	cmd_open_note,
	cmd_reveal_note,
	cmd_open_and_reveal_note,
	cmd_open_prev_note,
	cmd_open_next_note,
	cmd_open_prev_note_of_right_leaf,
	cmd_open_next_note_of_right_leaf,
	cmd_open_notes_smarter,
	cmd_longform2notechain,
	cmd_longform4notechain,
	cmd_sort_file_explorer,
	clear_inlinks,
	replace_notes_with_regx,
	move_file_to_another_folder,
	chain_insert_node,
	chain_set_seq_note,
	create_new_note,
	chain_move_up_node,
	chain_move_down_node,
	cmd_file_rename,
	cmd_mermaid_flowchart_link,
	cmd_mermaid_flowchart_folder,
	cmd_mermaid_flowchart_auto,
	cmd_execute_template_modal,
	cmd_toogle_css_block_in_note,
	cmd_set_frontmatter,
	cmd_pick_note_background_color,
	cmd_move_next_level,
	cmd_move_none_level,
	cmd_move_prev_level,
	cmd_insert_command_id,
	cmd_open_note_in_modal,
	cmd_open_note_in_view,
	cmd_execut_current_note
];

const commandBuildersDesktop = [
	cmd_file_open_with_system_app,
	cmd_file_show_in_system_explorer,
	cmd_open_oldbuddy,
]

export function addNoteChainCommands(plugin:NoteChainPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
	if((plugin.app as any).isMobile==false){
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
