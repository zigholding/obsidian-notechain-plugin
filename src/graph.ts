
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,moment,
	TAbstractFile,
	TFile,TFolder
} from 'obsidian';

import NoteChainPlugin from "../main";
import {NCEditor} from './NCEditor';
import {get_tp_func} from './utils'
import { strings } from './strings';
import { off } from 'process';



class NoteNode {
	tfile : TFile;
	note2id : {[key:string]:any};
	id : number;

	constructor(tfile:TFile) {
		this.tfile = tfile;
		this.note2id = {};
		this.id = 0;
	}

	get_id(tfile:TFile) {

		if (tfile.basename in this.note2id) {
			return this.note2id[tfile.basename];
		}
		let newId = `ID${this.id.toString().padStart(4, '0')}`;
		this.note2id[tfile.basename] = newId;
		this.id = this.id+1;
		return newId;

	}

	get_node(tfile:TFile){
		let id = this.get_id(tfile);
		return `${id}("${tfile.basename}")`
	}

	notes2class(){
		let msg = '\n';
		for(let tfile in this.note2id){
			msg = msg+`\tclass ${this.note2id[tfile]} internal-link;\n`;
		}
		return msg
	}
}

export class MermaidGraph{
	plugin:NoteChainPlugin;
	app:App;
	editor:NCEditor;

	constructor(plugin:NoteChainPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.editor = plugin.editor;
		this.editor = new NCEditor(this.app);
	}


	subgraph_chain(node:NoteNode,tfiles:Array<TFile>,subgraph='',line='<-->'){

		let msg = '';
		let items = tfiles.map(x=>x);
		let stab = '\t';
		if(subgraph!=''){
			msg = msg + `\n\tsubgraph ${subgraph}\n`;
			stab = '\t\t';
		}

		let i = 0;
		while(i<items.length-1){
			let prev = node.get_node(items[i]);
			let next = node.get_node(items[i+1]);
			msg = msg+`${stab}${prev}${line}${next}\n`;
			i = i+1;
		}

		if(subgraph!=''){
			msg = msg+"\tend\n";
		}
		return msg;
	}

	subgraph_links(node:NoteNode,tfiles:Array<TFile>,subgraph='',line='-->',tfiles_first=false){
		let msg = '';
		let items = tfiles.map(x=>x);
		let stab = '\t';
		if(subgraph!=''){
			msg = msg + `\n\tsubgraph ${subgraph}\n`;
			stab = '\t\t';

		}
		let i = 0;
		let sid = node.get_node(node.tfile);
		while(i<items.length){
			let id = node.get_node(items[i]);
			if(tfiles_first){
				msg = msg+`${stab}${id}${line}${sid}\n`;

			}else{
				msg = msg+`${stab}${sid}${line}${id}\n`;
			}
			i = i+1;
		}
		if(subgraph!=''){
			msg = msg+"\tend\n";
		}
		return msg;
	}

	subgraph_cross(node:NoteNode,tfiles:Array<TFile>,subgraph='',line='-->',tfiles_first=false){
		let msg = '';
		let items = tfiles.map(x=>x);
		let stab = '\t';
		if(subgraph!=''){
			msg = msg + `\n\tsubgraph ${subgraph}\n`;
			stab = '\t\t';

		}
		for(let tfile of tfiles){
			let sid = node.get_node(tfile);
			let olinks = this.plugin.chain.get_outlinks(tfile,true);
			for(let olink of olinks){
				if(olink==tfile){continue}
				if(tfiles.contains(olink)){
					let id = node.get_node(olink);
					msg = msg + `${stab}${sid}${line}${id}\n`;
				}
			}
		}
		
		if(subgraph!=''){
			msg = msg+"\tend\n";
		}
		return msg;
	}

	get_flowchart(tfile:TFile,N=2,c_chain='#F05454',c_inlink='#776B5D',c_outlink='#222831',c_anchor='#40A578'){
		if(!tfile){
			let leaf = this.plugin.chain.get_last_activate_leaf();
			if(leaf){
				tfile = leaf.view.file;
			}
		}

		if(!tfile){
			return 'No File.'
		}

		let node = new NoteNode(tfile);

		let nc = this.plugin;

		let msg = "\`\`\`mermaid\nflowchart TD\n";
		let chain = nc.chain.get_chain(tfile,N,N)
		msg = msg + this.subgraph_chain(node,chain,'笔记链');

		let inlinks = nc.chain.get_inlinks(tfile,true).filter((x:TFile)=>!chain.contains(x));
		let outlinks = nc.chain.get_outlinks(tfile,true).filter((x:TFile)=>!chain.contains(x));

		msg = msg + this.subgraph_links(node,inlinks,'入链','-->',true);

		msg = msg + this.subgraph_links(node,outlinks,'出链','-->');

		msg = msg + node.notes2class();
		msg = msg + [
			'classDef 笔记链C fill:'+c_chain,
			'classDef 入链C fill:'+c_inlink,
			'classDef 出链C fill:'+c_outlink,
			`classDef Anchor fill:${c_anchor},stoke:${c_anchor}`,
			'class 笔记链 笔记链C',
			'class 入链 入链C',
			'class 出链 出链C',
			''
		].join('\n')
		msg = msg+"\`\`\`";
		msg = msg.replace(
			`class ${node.get_id(tfile)} internal-link;`,
			`class ${node.get_id(tfile)} Anchor;`
		);
		return msg;
	}

	flowchart_folder(tfile:TFile,subgraph='Folder',color='#F05454',c_anchor='#40A578'){
		if(!tfile){
			let leaf = this.plugin.chain.get_last_activate_leaf();
			if(leaf){
				tfile = leaf.view.file;
			}
		}

		if(!tfile){
			return 'No File.'
		}

		let tfiles = this.plugin.chain.get_brothers(tfile);
		return this.flowchart_cross(tfile,tfiles,subgraph,color,c_anchor);
	}

	flowchart_notechain(tfile:TFile,N=10,subgraph='NoteChain',color='#F05454',c_anchor='#40A578'){
		if(!tfile){
			let leaf = this.plugin.chain.get_last_activate_leaf();
			if(leaf){
				tfile = leaf.view.file;
			}
		}

		if(!tfile){
			return 'No File.'
		}

		let tfiles = this.plugin.chain.get_chain(tfile,N,N);
		return this.flowchart_cross(tfile,tfiles,subgraph,color,c_anchor);
	}

	flowchart_cross(anchor:TFile,tfiles:Array<TFile>,subgraph='',color='#F05454',c_anchor='#40A578'){
		let node = new NoteNode(tfiles[0]);
		let msg = "\`\`\`mermaid\nflowchart TD\n";
		msg = msg + this.subgraph_cross(node,tfiles,subgraph);
		msg = msg + node.notes2class();
		msg = msg + [
			`classDef ${subgraph}C fill:${color}`,
			`classDef Anchor fill:${c_anchor},stoke:${c_anchor}`,
			`class ${subgraph} ${subgraph}C`,
			''
		].join('\n')
		msg = msg+"\`\`\`";
		msg = msg.replace(
			`class ${node.get_id(anchor)} internal-link;`,
			`class ${node.get_id(anchor)} Anchor;`
		);
		return msg;
	}

}