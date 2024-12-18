
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
import { link } from 'fs';



class NoteNode {
	tfile : TFile;
	note2id : {[key:string]:any};
	id : number;
	plugin:NoteChainPlugin;

	constructor(tfile:TFile,plugin:NoteChainPlugin) {
		this.tfile = tfile;
		this.note2id = {};
		this.id = 0;
		this.plugin = plugin;
	}

	// 返回 IDXXXX
	get_id(tfile:TFile) {
		if (tfile.basename in this.note2id) {
			return this.note2id[tfile.basename];
		}
		let newId = `ID${this.id.toString().padStart(4, '0')}`;
		this.note2id[tfile.basename] = newId;
		this.id = this.id+1;
		return newId;

	}

	// 返回IDXXXX["tfile.basename"]
	get_node(tfile:TFile){
		let id = this.get_id(tfile);
		return `${id}("${tfile.basename}")`
	}

	get_mehrmaid_node(node:string,avata=''){
		if (node in this.note2id) {
			return this.note2id[node];
		}
		if(node.startsWith('subgraph ')){
			return node.slice('subgraph '.length)
		}
		let newId = `ID${this.id.toString().padStart(4, '0')}`;
		this.note2id[node] = newId;
		this.id = this.id+1;
		let tfile = this.plugin.chain.get_tfile(node);
		if(tfile){
			if(avata ==''){
				avata = this.plugin.settings.avata
			}
			let meta = this.plugin.editor.get_frontmatter(tfile,avata);
			if(meta){
				if(meta.startsWith('#')){
					node = `![[${tfile.basename}${meta}|no-head]]`
				}else{
					node = meta.replace('SELF',`[[${tfile.basename}]]`);
				}
			}
		}
		return `${newId}("${node}")`;
	}

	get_canvas_node(node:string){
		if (node in this.note2id) {
			return this.note2id[node];
		}
		let newId = `ID${this.id.toString().padStart(4, '0')}`;
		this.note2id[node] = newId;
		this.id = this.id+1;
		return newId;

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
	}

	get_note_node(tfile:TFile){
		let node = new NoteNode(tfile,this.plugin);
		return node;
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

	// [src,dst,io]
	edges_of_tfiles(tfiles:Array<TFile>,merge_inout=true){
		let inlinks:{[key:string]:Array<TFile>} = {}
		let outlinks:{[key:string]:Array<TFile>} = {}
		for(let tfile of tfiles){
			outlinks[tfiles.indexOf(tfile)] = this.plugin.chain.get_outlinks(tfile,true);
			inlinks[tfiles.indexOf(tfile)] = this.plugin.chain.get_inlinks(tfile,true);
		}
		
		let edges = [];
		for(let tfile of tfiles){
			let i = tfiles.indexOf(tfile);
			for(let outlink of outlinks[i]){
				if(tfiles.contains(outlink)){
					if(tfiles.indexOf(outlink)<=i){continue;}
					if(merge_inout){
						if(inlinks[i].contains(outlink)){
							edges.push([tfile,outlink,true]);
						}else{
							edges.push([tfile,outlink,false]);
						}
					}else{
						edges.push([tfile,outlink,false]);
					}
				}
			}

			for(let inlink of inlinks[i]){
				if(tfiles.contains(inlink)){
					if(tfiles.indexOf(inlink)<=i){continue;}
					if(merge_inout){
						if(!outlinks[i].contains(inlink)){
							edges.push([inlink,tfile,false]);
						}
					}else{
						edges.push([inlink,tfile,false]);
					}
				}
			}
		}
		return edges;
	}

	subgraph_cross(node:NoteNode,tfiles:Array<TFile>,subgraph='',line='-->',tfiles_first=false){
		let msg = '';
		let items = tfiles.map(x=>x);
		let stab = '\t';
		if(subgraph!=''){
			msg = msg + `\n\tsubgraph ${subgraph}\n`;
			stab = '\t\t';

		}
		
		let edges = this.edges_of_tfiles(tfiles);
		for(let edge of edges){
			let sid = node.get_node(edge[0] as any);
			let did = node.get_node(edge[1] as any);
			if(edge[2]){
				msg = msg + `${stab}${sid}<-.->${did}\n`;
			}else{
				msg = msg + `${stab}${sid}-.->${did}\n`;
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

		let node = new NoteNode(tfile,this.plugin);

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
		let node = new NoteNode(tfiles[0],this.plugin);
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

	get_subgrah_names(group_name:string,tfiles:Array<TFile>,name='group'){
		let nc = this.plugin;
		let items:{[key:string]:string} = {}
		for(let cfile of tfiles){
			let cgroup = nc.editor.get_frontmatter(cfile,name)
			if(cgroup && Array.isArray(cgroup)){
				for(let cg of cgroup){
					let tmp = cg.split('/');
					if(tmp[0]==group_name){
						if(tmp.length==1){
							items[tfiles.indexOf(cfile)] = '';
						}else{
							items[tfiles.indexOf(cfile)] = tmp[1];
						}
						break
					}
				}
			}
		}
		return items
	}

	flowchart_groups(anchor:TFile,name='group'){
		let nc = this.plugin;

		let tfiles = nc.chain.get_brothers(anchor);
		tfiles = nc.chain.get_group_links(tfiles,1)

		let node = nc.mermaid.get_note_node(anchor);

		
		let group = nc.editor.get_frontmatter(anchor,name);
		if(!group||!Array.isArray(group)){return [];}
		let res:Array<string> = [];
		for(let g of group){
			g = g.split('/')[0]
			let items = this.get_subgrah_names(g,tfiles,name);
			let subs = new Set(Object.values(items))

			let msg = `\`\`\`mermaid\n---\ntitle: ${g}\n---\nflowchart TD\n`;
			for(let sub of subs){
				if(sub==''){
					for(let idx in items){
						if(items[idx]==sub){
							msg = msg+'\n'+node.get_node(tfiles[idx]);
						}
					}
				}else{
					msg = msg+'\nsubgraph '+sub+'\n'
					for(let idx in items){
						if(items[idx]==sub){
							msg = msg+'\n\t'+node.get_node(tfiles[idx]);
						}
					}

					msg = msg+'\nend'
				}
			}
			msg = msg+'\n'+this.subgraph_cross(node,Object.keys(items).map(x=>tfiles[x]));
			msg = msg+'\n'+node.notes2class();
			msg = msg+"\n\`\`\`";
			res.push(msg);
		}
		return res;
	}

	get_relationship_graph(tfile:TFile, N=1, key='link',show_all_node=true) {
		let nc = this.plugin;
		let node = new NoteNode(tfile,this.plugin);
		let msg = "```mermaid\nflowchart TD\n";

		// 获取 N 层链接的笔记
		let tfiles = nc.chain.get_group_links([tfile], N);
		if(show_all_node){
			for(let tfile of tfiles){
				msg +=`${node.get_node(tfile)}\n`
			}
		}
		
		// 用于跟踪已处理的笔记
		let processedFiles = new Set<TFile>();

		for (let currentFile of tfiles) {
			if (processedFiles.has(currentFile)) continue; // 如果已处理，跳过
			processedFiles.add(currentFile); // 标记为已处理

			let links = nc.editor.get_frontmatter(currentFile, key);
			if (links) {
				for (let [relation, linkedNote] of Object.entries(links)) {
					if(linkedNote instanceof Array){
						for(let item of linkedNote){
							let linkedTFile = nc.chain.get_tfile(item as string);
							if (linkedTFile instanceof TFile) {
								msg += `\t${node.get_node(currentFile)} -->|${relation}| ${node.get_node(linkedTFile)}\n`;
							}
						}
					}else{
						let linkedTFile = nc.chain.get_tfile(linkedNote as string);
						if (linkedTFile instanceof TFile) {
							msg += `\t${node.get_node(currentFile)} -->|${relation}| ${node.get_node(linkedTFile)}\n`;
						}
					}
					
				}
			}
		}

		msg = msg + node.notes2class();
		msg += "```";
		let c_anchor='#40A578'
		msg = msg.replace(
			`class ${node.get_id(tfile)} internal-link;`,
			`classDef Anchor fill:${c_anchor},stoke:${c_anchor}\nclass ${node.get_id(tfile)} Anchor;`
		);
		return msg;
	}

	get_mehrmaid_graph(tfile:TFile, N=1, key='mermaid',c_anchor='#d4c4b7',field='avata') {

		if(!tfile){
			let leaf = this.plugin.chain.get_last_activate_leaf();
			if(leaf){
				tfile = leaf.view.file;
			}
		}

		if(!tfile){
			return 'No File.'
		}

		let nc = this.plugin;
		let node = new NoteNode(tfile,this.plugin);
		let msg = "```mehrmaid\nflowchart TD\n";

		// 获取 N 层链接的笔记
		let tfiles;
		if(N==-1){
			tfiles = nc.chain.get_brothers(tfile);
		}else{
			tfiles = nc.chain.get_group_links([tfile], N);
		}
		tfiles = nc.chain.sort_tfiles_by_chain(tfiles) as TFile[];

		for (let currentFile of tfiles) {
			let src = `[[${currentFile.basename}]]`
			let links = nc.editor.get_frontmatter(currentFile, key);
			if (links && Array.isArray(links)) {
				for(let link of links){
					if(link['edge']!=null && link['node']!=null){
						let cedge = link['edge'];
						let cnode = link['node'];
						if(cedge==''){
							cedge = ''
						}else{
							cedge = `|"${cedge}"|`
						}
						let line = '-->';
						if(link['line']){
							line = link['line']
						}
						if(line[0]=='<' && line[line.length-1]!='>'){
							line = line.slice(1)+'>'
							if(cnode instanceof Array){
								for(let item of cnode){
									msg += `${node.get_mehrmaid_node(item,field)} ${line} ${cedge} ${node.get_mehrmaid_node(src,field)}\n`;
								}
							}else{
								msg += `${node.get_mehrmaid_node(cnode,field)} ${line} ${cedge} ${node.get_mehrmaid_node(src,field)}\n`;
							}
						}else{
							if(cnode instanceof Array){
								for(let item of cnode){
									msg += `${node.get_mehrmaid_node(src,field)} ${line} ${cedge} ${node.get_mehrmaid_node(item,field)}\n`;
								}
							}else{
								msg += `${node.get_mehrmaid_node(src,field)} ${line} ${cedge} ${node.get_mehrmaid_node(cnode,field)}\n`;
							}
						}
					}else{
						if(link['group']){
							msg += `subgraph ${link['group']}\n\t${node.get_mehrmaid_node(src,field)}\nend\n`
							if(link['color']){
								msg += `classDef ${link['group']}Class fill:${link['color']}\n`
								msg += `class ${link['group']} ${link['group']}Class\n`
							}
						}
					}
				}
			}
		}
		let src = `[[${tfile.basename}]]`
		msg += `${node.get_mehrmaid_node(src)}\n`
		if(c_anchor){
			msg += `classDef Anchor fill:${c_anchor},stoke:${c_anchor}\nclass ${node.get_mehrmaid_node(src)} Anchor;\n`
		}
		msg += "```";
		return msg;
	}

	
}

export class EchartGraph{
	plugin:NoteChainPlugin;
	app:App;
	editor:NCEditor;

	constructor(plugin:NoteChainPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.editor = plugin.editor;
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
		

		let node = new NoteNode(tfile,this.plugin);

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
		let node = new NoteNode(tfiles[0],this.plugin);
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

export class CanvasGraph{
	plugin:NoteChainPlugin;
	app:App;
	editor:NCEditor;

	constructor(plugin:NoteChainPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.editor = plugin.editor;
	}

	gen_random_string(length:number) {
		let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let randomString = '';
		
		for (let i = 0; i < length; i++) {
		  let randomIndex = Math.floor(Math.random() * characters.length);
		  randomString += characters.charAt(randomIndex);
		}
		
		return randomString;
	  }

	new_note_node(tfile:TFile){
		let node = new NoteNode(tfile,this.plugin);
		return node;
	}

	gen_node(NN:NoteNode,tfile:TAbstractFile|string,x=0,y=0,width=400,height=400){
		let rsp:{[key:string]:any} = {};
		if(typeof(tfile) == 'string'){
			rsp['type'] = 'text';
			rsp['text'] = tfile;
			rsp['id'] = NN.get_canvas_node(rsp['text']);
		}else{
			rsp['type'] = 'file';
			if(tfile instanceof TFolder){
				rsp['file'] = tfile.path+'/'+tfile.name+'.md';
			}else{
				rsp['file'] = tfile.path;
			}
			rsp['id'] = NN.get_canvas_node(rsp['file']);
		}

		rsp['x'] = x;
		rsp['y'] = y;
		rsp['height'] = height;
		rsp['width'] = width;

		return rsp;
	}

	rc_of_sequence(i:number,r:number,c:number){
		/*
		如 r 行 c 列排序，第 i 个卡片对应的行列号是多少
		*/
		let row = Math.floor((i - 1) / c) + 1;
		let col = row % 2 === 1 ? (i - 1) % c + 1 : c - ((i - 1) % c);
		return [row, col];
	}

	async note_to_canvas(tfile:TFile,nrow=1,ncol=1,width=400,height=400,wmarin=100,hmargin=100,write=true){
		let content = await this.plugin.app.vault.read(tfile);
		let titles = [...content.matchAll(/^(#+)\s+(.+)/gm)]; // 匹配所有标题

		if(nrow*ncol<titles.length){
			ncol = Math.ceil(titles.length/nrow);
		}

		let nodes = [];
		let i = 0;
		let NN = this.new_note_node(tfile);
		for(let match of titles){
			i = i+1;
			let title = `![[${tfile.basename}#${match[2]}]]`;
			let pos = this.rc_of_sequence(i, nrow, ncol);
			let node = this.gen_node(
				NN=NN,
				title,
				pos[1]*(width+wmarin),
				pos[0]*(height+hmargin),
				width=width,
				height=height
			)
			nodes.push(node);
		}
		let res = {
			"nodes":nodes,
			"edges":[]
		}
		if(write){
			let path = this.path_md2canvas(tfile);
			await this.write_canvas_file(res,path);
		}
		return res;
	}

	async write_canvas_file(canvas:{},path:string){
		let msg = JSON.stringify(canvas);
		let canvasFile = this.plugin.app.vault.getAbstractFileByPath(path);
		if (canvasFile) {
			await this.plugin.app.vault.modify(canvasFile as TFile, msg);
		} else {
			// 如果画布文件不存在，创建新文件并写入内容
			await this.plugin.app.vault.create(path, msg);
		}
	}

	path_md2canvas(tfile:TFile){
		return tfile.path.replace('.md','.canvas')
	}
}