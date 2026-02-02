

import {
	App, Notice, TFile, moment
} from 'obsidian';

import NoteChainPlugin from "../main";

export class DailyJob {
	plugin: NoteChainPlugin;
	app: App;
	START_TIME: any;
	buffer: number;
	dv: any;
	nc: any;
	PATTERN: RegExp;
	milestones: string[];
	groups: string[];
	default_group: string;
	tfile: TFile | null;
	date: string;

    constructor(plugin: NoteChainPlugin) {
        this.plugin = plugin;
		this.app = plugin.app;
        this.START_TIME = this.plugin.easyapi.time.parse_time('06:45'); // 每天的起始时间
        this.buffer = 10; // 缓冲时间
        this.dv = this.plugin.easyapi.dv;
        this.nc = this.plugin;
        this.PATTERN = /\n\> \[\!note\]\+ 事项 Done\n/;
        this.milestones = ['睡觉'];
        this.groups = ['作息', '工作', '家庭', '个人'];
        this.default_group = '工作';
        this.tfile = this.plugin.chain.get_last_daily_note();
        this.date = this.tfile ? this.tfile.basename : moment().format('YYYY-MM-DD');
    }

    parse_fields(item: string): any | null {
        let res: any = this.plugin.easyapi.editor.parse_list_dataview(item);
        if (!this.plugin.easyapi.editor.keys_in(['st', 'xt', 'do'], res)) {
		    return null;
	    }
        const st = this.plugin.easyapi.time.parse_time(res['st'], this.date);
        const xt = this.plugin.easyapi.time.parse_minutes(res['xt']);
		if (!st || Number.isNaN(xt)) {
			return null;
		}
        res['st'] = st;
        res['xt'] = xt;
        res['et'] = st.clone().add(xt, 'minutes');
        return res;
    }

    async get_jobs(tfile: TFile | string | Array<TFile> | null): Promise<any[] | null> {
        if (!tfile) {
            tfile = this.plugin.chain.get_last_daily_note();
        }
        if (Array.isArray(tfile)) {
            let jobs: any[] = [];
            for (let c of tfile) {
                let cjobs = await this.get_jobs(c);
                if (cjobs) {
                    for (let job of cjobs) {
                        jobs.push(job);
                    }
                }
            }
            return jobs;
        } else {
            if (typeof (tfile) == 'string') {
                tfile = this.plugin.chain.get_tfile(tfile);
            }
            if (!tfile) { return null }
            let ctx = await this.app.vault.read(tfile as TFile);
            let meta = this.app.metadataCache.getFileCache(tfile as TFile);
			if (!meta || !meta.listItems) {
				return [];
			}
            let items = meta.listItems.map(x => this.plugin.easyapi.editor.slice_by_position(ctx, x.position));
	        // let regx = /^- ⏰ \(st::.*\) 🎯\(do::.*\) ⏳\(xt::.*\) $/;
	        items = items.map(x=>this.parse_fields(x)).filter(x=>x);
            return items as any[];
        }
    }

    async select_start_time(jobs: any[], is_today: boolean = true): Promise<string | null> {
        let timeList = this.plugin.easyapi.time.generate_start_times(jobs, 5,is_today) as string[];
        if(is_today && timeList){
	        let ct = moment().format("HH:mm");
	        timeList = timeList.filter(x=>x && x.localeCompare(ct)<0);
        }
        if (timeList.length == 0) {
            new Notice('已记录！')
            return null;
        }
        let st = await this.nc.dialog_suggest(timeList, timeList, '开始时间', true)
        if (!st) { return null }
        if (st.match(/^\d{4}$/)) {
            st = st.slice(0, 2) + ':' + st.slice(2, 4);
        }
        if (st.match(/^\d{2}:\d{2}$/)) {
            return st;
        }
        return null;
    }

    async select_x_time(st: any = null): Promise<number | null> {
	    let xt: any;
	    const stMoment = this.plugin.easyapi.time.parse_time(st,this.date);
        let xitems: string[] = ['5min', '10min', '15min', '20min', '25min', '30min', '45min', '1hour', '2hour', '3hour'];
		if(stMoment){
			let ct = moment().add(5,'minutes');
			if(this.plugin.easyapi.time.as_date(ct).format('YYYY-MM-DD')!=this.plugin.easyapi.time.as_date(stMoment).format('YYYY-MM-DD')){
				ct = this.plugin.easyapi.time.as_date(stMoment).clone().add(1,'days').add(-1,'minutes');
			}
			// console.log(st.format('YYYY-MM-DD HH:mm'),ct.format('YYYY-MM-DD HH:mm'))
			xitems = xitems.filter(x=>{
				let minutes = this.plugin.easyapi.time.parse_minutes(x);
				let t1 = stMoment.clone().add(minutes,'minutes');
				if((t1.hour()>ct.hour())||(t1.hour()==ct.hour() && t1.minute()>ct.minute())){
					return false	
				}else{
					return true
				}
			})
			if(this.plugin.easyapi.time.as_date(ct).isSame(this.plugin.easyapi.time.as_date(stMoment),'day')){
				for(let i of [15,10,5,0]){
					let diffMinutes = (moment().valueOf()-stMoment.valueOf())/1000/60;
					let nt = Math.round(diffMinutes/5)*5-i;
					if(nt>0){
						if(!xitems.contains(`${nt}min`)){
							xitems.push(`${nt}min`)
						}
					}
				}
			}
			xitems = xitems.sort((a,b)=>this.plugin.easyapi.time.parse_minutes(a)-this.plugin.easyapi.time.parse_minutes(b))
			xt = await this.nc.dialog_suggest(
				xitems.map(x=>{
					let minutes = this.plugin.easyapi.time.parse_minutes(x);
					return x+'🕐'+stMoment.clone().add(minutes,'minutes').format('HH:mm')
				}),
				xitems,
				'持续时间',
				true
			)
		}else{
	        xt = await this.nc.dialog_suggest(xitems, xitems, '持续时间', true)
		}
        if (!xt) { return null }
        let items = xt.match(/^(\d+\.?\d*)(min|hour|day|h|m)?$/)
        if (items && items[1] && items[2]) {
            let xt = `${items[1]}${items[2]}`
            return this.plugin.easyapi.time.parse_minutes(xt);
        } else if (items && items[1]) {
            return parseInt(items[1]);
        }
        return null;
    }

    count_elements(arr: any[]): { element: string; count: number }[] {
        const countMap = arr.reduce((acc: { [key: string]: number }, item: any) => {
            const key = String(item);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });

        return Object.entries(countMap).map(
			([element, count]) => ({ element, count: count as number })
		);
    }

    async select_jobs(st: string, xt: number): Promise<string | null> {
        let xitems: string[] = [];
        if (!this.tfile) { return null; }
        let tfiles = this.plugin.chain.get_chain(this.tfile, 7, 2, false);
        let jobs: any[] | null = await this.get_jobs(tfiles);
		if (!jobs) { return null; }
        const stMoment = this.plugin.easyapi.time.parse_time(st,this.date);
		if (!stMoment) { return null; }
        let t0 = stMoment.clone().add(-this.buffer, 'minutes');
        let t1 = stMoment.clone().add(xt + this.buffer, 'minutes');
        jobs = jobs.filter(x => {
            return (x.st <= t0 && x.et >= t0) || (x.st <= t1 && x.et >= t1)
        })

        xitems = jobs.map(x => x.do);
        let cels = this.count_elements(xitems);
        let ks = cels.map(x => `${x.element}(${x.count})`);
        let vs = cels.map(x => `${x.element}`);
        xitems = [...new Set(xitems)];
        let job = await this.nc.dialog_suggest(ks, vs, '事项', true)
        return job;
    }


    job_to_line(st: string, xt: number, job: string): string {
        let ctx = `- ⏰ (st::${st}) 🎯(do::${job}) ⏳(xt::${xt}m) `;
        return ctx;
    }

    async insert_ctx(tfile: TFile, msg: string, pattern: RegExp): Promise<void> {
        let file_ctx = await this.app.vault.cachedRead(tfile);
        let idx = file_ctx.search(pattern);
        let match = file_ctx.match(pattern);
        let ctx = '';
        if (idx == -1) {
            ctx = `${file_ctx}\n\n${msg}`
        } else {
			if (match && match[0]) {
            	ctx = `${file_ctx.slice(0, idx + match[0].length)}\n${msg}${file_ctx.slice(idx + match[0].length)}`
			} else {
				ctx = `${file_ctx}\n\n${msg}`;
			}
        }

        await this.app.vault.modify(tfile, ctx)
    }

	async prase_job_item_v1(ctx: string): Promise<string | null> {
		let items = ctx.match(/^((?:.*?点)半?(?:(?:.*?分)|(?:.*?分钟))?)(.*?)花了(.*)$/);
		if(!items){return null}
		let stMoment = this.plugin.easyapi.time.parse_time(items[1]);
		if (!stMoment) { return null; }
		let st = stMoment.format('HH:mm');
		let xt = this.plugin.easyapi.time.parse_minutes(items[3]);
		let job = items[2].trim();
		return this.job_to_line(st, xt, job);
	}

	async prase_job_item_v2(ctx: string): Promise<string | null> {
		let items = ctx.match(/^((?:.*?点)半?(?:(?:.*?分)|(?:.*?分钟))?)(?:到|至)((?:.*?点)半?(?:(?:.*?分)|(?:.*?分钟))?)(.*?)$/);
		if(!items){return null}
		let stMoment = this.plugin.easyapi.time.parse_time(items[1],this.date);
		let etMoment = this.plugin.easyapi.time.parse_time(items[2],this.date);
		if (!stMoment || !etMoment) { return null; }
		let xt = parseInt(((etMoment.valueOf()-stMoment.valueOf())/1000/60).toString());
		let job = items[3].trim();
		return this.job_to_line(stMoment.format('HH:mm'), xt, job);
	}
	
	async prase_job_item_v3(ctx: string,delta=5): Promise<string | null> {
		let items = ctx.split('\n').filter(x=>x.trim());
		if(items.length<=1){return null}
		let stMoment = this.plugin.easyapi.time.parse_time(items[0],this.date);
		if (!stMoment) { return null; }
		let job = items[1].trim();
		let xt: any;
		if(items[2]){
			xt = this.plugin.easyapi.time.parse_minutes(items[2]);
		}else{
			let et = this.plugin.easyapi.time.parse_time(moment().format("HH:mm"),this.date);
			if (!et) { return null; }
			xt = parseInt(((et.valueOf()-stMoment.valueOf())/1000/60).toString());
			xt = Math.round(xt/5)*5;
			if(xt>delta || xt<0){
				xt = await this.select_x_time(stMoment);
			}
			if(!xt){return null}
		}
		return this.job_to_line(stMoment.format('HH:mm'), xt, job);
	}

	async prase_job_item_v4(): Promise<string | null> {
		let tfile = this.plugin.chain.get_last_daily_note();
        if (!tfile) { return null; }
        let jobs: any[] | null = await this.get_jobs(tfile);
		jobs = jobs || [];
        let is_today = tfile.basename == moment().format('YYYY-MM-DD')
        let st = await this.select_start_time(jobs, is_today);
        if (!st) { return null; }

        let xt = await this.select_x_time(st);
        if (!xt) { return null; }
		let job = await this.select_jobs(st, xt);
		if(!job){return null;}
		return this.job_to_line(st, xt, job);
	}

	async run(area: { value: string } | null): Promise<void> {
		let job: string | null = null;
        if(area){
			let ctx = area.value.trim();
			job = await this.prase_job_item_v1(ctx);
			if(!job){
				job = await this.prase_job_item_v2(ctx);
			}
			if(!job){
				job = await this.prase_job_item_v3(ctx);
			}
		}
		if(!job){
			job = await this.prase_job_item_v4();
		}
		
		if(job){
			let tfile = this.plugin.chain.get_last_daily_note();
			if (tfile) {
				await this.insert_ctx(tfile, job, this.PATTERN);
				let msg: any = this.plugin.easyapi.editor.parse_list_dataview(job);
				let st = this.plugin.easyapi.time.parse_time(msg.st,this.date);
				let xt = this.plugin.easyapi.time.parse_minutes(msg.xt);
				if (area && st && !Number.isNaN(xt)) {
					let nxt = st.clone().add(xt,'minutes').format('HH:mm');
					area.value = nxt+'\n';
				}
			}
			return
		}
    }
}
