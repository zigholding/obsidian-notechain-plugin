import { moment,App } from 'obsidian';
import { Moment } from 'moment';
import { EasyAPI } from "./easyapi";

export class Time{
    app:App;
    ea:EasyAPI;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

	get today(){
		let t = moment().format('YYYY-MM-DD');
		return moment(t)
	}

	as_date(t:Moment){
		let xt = t.format('YYYY-MM-DD');
		return moment(xt)
	}
	
	/**
	 * 获取相对于基准日期的偏移月份的指定日期
	 * @param {number} dayIndex - 日期索引（正数表示第几天，负数表示倒数第几天）
	 * @param {number} monthOffset - 月份偏移量（正数为未来月份，负数为过去月份）
	 * @param {Date|string|moment.Moment} baseDate - 基准日期，默认为当日
	 * @returns {moment.Moment} 计算后的目标日期
	 */
	relative_month_day(dayIndex:number, monthOffset:number=0, baseDate=this.today) {
	    // 创建基准日期的moment对象
	    let baseMoment = moment(baseDate).clone();
	    
	    // 计算目标月份
	    let targetMoment = baseMoment.clone().add(monthOffset, 'months');
	    
	    // 处理日期索引
	    if (dayIndex > 0) {
	        // 正数索引：设置为目标月份的第N天
	        targetMoment.startOf('month').add(dayIndex - 1, 'days');
	    } else {
	        // 负数索引：设置为目标月份的倒数第N天
	        targetMoment.endOf('month').add(dayIndex + 1, 'days');
	    }
	    return this.as_date(targetMoment);
	}

	/**
	 * 获取相对于基准日期的偏移周数的指定星期几
	 * @param {number} dayIndex - 星期索引（0-6，0为周日，1为周一，依此类推；或使用负数表示倒数）
	 * @param {number} weekOffset - 周数偏移量（正数为未来周数，负数为过去周数）
	 * @param {Date|string|moment.Moment} baseDate - 基准日期，默认为当日
	 * @returns {moment.Moment} 计算后的目标日期
	 * 
	 * @example
	 * relative_week_day(1, 0)       // 本周一
	 * relative_week_day(0, -1)      // 上周日
	 * relative_week_day(6, 2)       // 两周后的周六
	 * relative_week_day(-1, 1)      // 下周的倒数第1天（周六）
	 */
	relative_week_day(dayIndex:number, weekOffset:number = 0, baseDate = this.today) {
	    // 创建基准日期的moment对象并克隆（避免污染原对象）
	    let baseMoment = moment(baseDate).clone();
	    
	    // 处理周偏移：先移动到目标周的开始（周一）
	    let targetMoment = baseMoment.add(weekOffset, 'weeks');
	    
	    // 处理星期索引
	    if (dayIndex >= 0) {
	        // 正数索引：直接设置为目标星期（0=周日到6=周六）
	        targetMoment.day(dayIndex);
	    } else {
	        // 负数索引：计算目标周的倒数第N天
	        // 1. 先移动到目标周的周末（周日）
	        // 2. 再向前移动 |dayIndex| - 1 天（例如dayIndex=-1为周六）
	        targetMoment.endOf('week').add(dayIndex + 1, 'days');
	    }
	    
	    // 返回标准化后的日期（去除时间部分）
	    return this.as_date(targetMoment);
	}

	/**
     * 解析中文自然语言日期（新增支持"下个月5号"/"上个月15号"等格式）
     * @param {string} msg - 包含日期的文本（如"下个月5号开会"）
     * @param {moment.Moment} base - 基准日期，默认为当天
     * @returns {{date: string, text: string}} 处理后的日期和文本
     * 
     * @example
     * parse_date("下个月5号评审") // {date: "2025-07-05", text: "评审"}
     * parse_date("上个月15号账单") // {date: "2025-05-15", text: "账单"}
     */
    extract_chinese_date(msg:string, base = this.today) {
	    let result:{[key:string]:any} = { date: base.format('YYYY-MM-DD'), text: msg };
	
	    // 1. 处理相对天数（今天/昨天/明天等）
	    let dayKeywords = [
	        { pattern: /^大前天/, days: -3 },
	        { pattern: /^前天/, days: -2 },
	        { pattern: /^昨天/, days: -1 },
	        { pattern: /^今天/, days: 0 },
	        { pattern: /^明天/, days: 1 },
	        { pattern: /^后天/, days: 2 },
	        { pattern: /^大后天/, days: 3 }
	    ];
	    for (let { pattern, days } of dayKeywords) {
	        if (pattern.test(msg)) {
	            result.date = base.clone().add(days, 'days').format('YYYY-MM-DD');
	            result.text = msg.replace(pattern, '').trim();
	            return result;
	        }
	    }
	
	    // 3. 处理「下个月X号」或「上个月X号」格式
	    let monthDayMatch = msg.match(/^(上个月|下个月)(\d{1,2})号?/);
	    if (monthDayMatch) {
	        let [fullMatch, direction, day] = monthDayMatch;
	        let monthOffset = direction === '上个月' ? -1 : 1;
	        let targetDate = base.clone().add(monthOffset, 'months').date(parseInt(day));
	        
	        if (targetDate.date() !== parseInt(day)) {
	            targetDate.endOf('month');
	        }
	        
	        result.date = targetDate.format('YYYY-MM-DD');
	        result.text = msg.slice(fullMatch.length).trim();
	        return result;
	    }
	
	    // 4. 处理周几和下周几
	    let weekMatch = msg.match(/^([上下]([一二三四五六七八九十两]|\d+)周周|上上周|上上星期|上周|上星期|周|星期|下周|下星期|下下周|下下星期)([一二三四五六七日]|[1-7])/);
	    if (weekMatch) {
	        let [fullMatch,weekStr, weekCount,dayChar] = weekMatch;
	        let dayMap:{[key:string]:any} = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '日':7, '七':7};
	        if(weekCount){
			    let nmap:{[key:string]:any} = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '日':7, '七':7,'八':8,'九':9,'两':2};
			    weekCount = nmap[weekCount] || parseInt(weekCount);
	        }
	        let targetDay = dayMap[dayChar] || parseInt(dayChar);
			let weekOffset = ['周','星期'].contains(weekStr)? 0 : 
				['下周','下星期'].contains(weekStr)? 1 : 
				['下下周','下下星期'].contains(weekStr)? 2 : 
				['上周','上星期'].contains(weekStr)? -1 : 
				['上上周','上上星期'].contains(weekStr)? -2 : 
				(msg.slice(0,1)=='上' ? -weekCount : weekCount);
	        let date = this.relative_week_day(targetDay,weekOffset as number,base);
	        
	        if (date.isBefore(base, 'day')) {
	            date.add(1, 'week');
	        }
	        
	        result.date = date.format('YYYY-MM-DD');
	        result.text = msg.slice(fullMatch.length).trim();
	        return result;
	    }
	
	    // 5. 处理x月y号格式
	    let absoluteMonthMatch = msg.match(/^(\d{1,2})月(\d{1,2})(?:号|日)?/);
	    if (absoluteMonthMatch) {
	        const [fullMatch, month, day] = absoluteMonthMatch;
	        let date = base.clone().month(parseInt(month) - 1).date(parseInt(day));
	        
	        if (date.isBefore(base, 'day')) {
	            date.add(1, 'year');
	        }
	        
	        result.date = date.format('YYYY-MM-DD');
	        result.text = msg.slice(fullMatch.length).trim();
	        return result;
	    }
	    if(result.text==msg){
		    result.date = null;
	    }
	    return result;
	}


	

	parse_minutes(xt: string | number): { prefix: string; suffix: string; duration: number } {
		if (typeof xt === 'number') {
			return { prefix: '', suffix: '', duration: xt };
		}
		if (typeof xt !== 'string') {
			return { prefix: String(xt), suffix: '', duration: NaN };
		}
	
		// 辅助：将中文/阿拉伯数字字符串转为数字（复用原有的 cn2num）
		const toNumber = (s:string) => {
			if (!s) return 0;
			// 如果是纯阿拉伯数字
			if (/^\d+$/.test(s)) return parseInt(s, 10);
			// 调用原有的中文数字转换函数
			return this.ea.editor.cn2num(s);
		};
	
		// 定义所有时间模式，按优先级排列（先尝试更长的模式避免误匹配）
		const patterns = [
			// 1. X个半小时
			{ regex: /([零一二两三四五六七八九十\d]+)\s*个\s*半小时/, handler: (m:string[]) => toNumber(m[1]) * 60 + 30 },
			// 2. X小时Y分钟（带单位）
			{ regex: /([零一二两三四五六七八九十\d]+)\s*(?:小时|时)\s*([零一二两三四五六七八九十\d]+)\s*(?:分钟|分)/, handler: (m:string[]) => toNumber(m[1]) * 60 + toNumber(m[2]) },
			// 3. X小时（单独）
			{ regex: /([零一二两三四五六七八九十\d]+)\s*(?:小时|时)(?!\s*半)/, handler: (m:string[]) => toNumber(m[1]) * 60 },
			// 4. X分钟（单独）
			{ regex: /([零一二两三四五六七八九十\d]+)\s*(?:分钟|分)/, handler: (m:string[]) => toNumber(m[1]) },
			// 5. X半 (如“一个半”小时？这里简单处理“半”作为0.5小时，但通常前面要有数字。为了全面，加一个“半”单独？)
			// 但半通常出现在“半小时”或“个半小时”中，已被模式1覆盖。
		];
	
		let bestMatch = null;
		let bestHandler = null;
		let bestIndex = Infinity;
		let bestLength = 0;
	
		for (const pattern of patterns) {
			const regex = new RegExp(pattern.regex.source, 'g');
			let match;
			while ((match = regex.exec(xt)) !== null) {
				if (match.index < bestIndex) {
					bestIndex = match.index;
					bestLength = match[0].length;
					bestMatch = match;
					bestHandler = pattern.handler;
				}
			}
		}
	
		if (bestMatch !== null) {
			const duration = bestHandler?.(bestMatch);
			if(!duration){return { prefix: xt, suffix: '', duration: NaN }}
			const prefix = xt.slice(0, bestIndex);
			const suffix = xt.slice(bestIndex + bestLength);
			return { prefix, suffix, duration };
		}
		
		// 没有匹配任何时间表达式
		return { prefix: xt, suffix: '', duration: NaN };
	};

	/** 将时刻按 base 分钟粒度对齐（从当日 0:00 起的总分钟数向下取整到 base 的倍数）。base<=1 时不调整。 */
	snapTimeToBase(m: Moment, base: number) {
		const t = m.clone();
		if (!base || base <= 1) {
			return t;
		}
		const total = t.hour() * 60 + t.minute();
		const floored = Math.floor(total / base) * base;
		return t.clone().startOf('day').add(floored, 'minutes');
	}
	
	parse_time(st:string|Moment, date:Moment|string = this.today,nearest=true, base = 5) {
		if(!st){return null}
		if(moment.isMoment(st)){return this.snapTimeToBase(st, base)}

		if (typeof st === 'string' && st.trim() === '现在') {
			return this.snapTimeToBase(moment(), base);
		}

		if(moment.isMoment(date)){
			date = date.format('YYYY-MM-DD');
		}

		let items = st.match(/^(\d{2}):?(\d{2})$/);

		if(items){
			let t = moment(`${date} ${items[1]}:${items[2]}:00`, "YYYY-MM-DD HH:mm:ss");
			if(t.isValid()){return this.snapTimeToBase(t, base)}
		}

		const mix = st.trim().match(/^(凌晨|早上|上午|中午|下午|晚上|傍晚)\s*(\d{1,2})\s*[:：]\s*(\d{1,2})$/);
		if (mix) {
			let hour = parseInt(mix[2], 10);
			let minute = parseInt(mix[3], 10);
			if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
				return null;
			}
			const period = mix[1];
			if (period === '凌晨' && hour === 12) {
				hour = 0;
			} else if (['下午'].includes(period)) {
				hour = hour >= 12 ? hour : hour + 12;
			} else if (['晚上', '傍晚'].includes(period)) {
				hour = hour >= 5 && hour < 12 ? hour + 12 : hour;
			} else if (period === '中午') {
				if (hour > 0 && hour < 12) {
					hour += 12;
				}
			}
			hour %= 24;
			let t = moment(`${date} ${hour}:${minute}`, 'YYYY-MM-DD HH:mm');
			if (t.isValid()) {
				return this.snapTimeToBase(t, base);
			}
			return null;
		}
	
		let cnTimeRegex = /^(早上|上午|凌晨|下午|晚上)?([零一二两三四五六七八九十百]+|[\d]+)点(半|([零一二两三四五六七八九十]+)分?|([\d]+)分?)?$/;
		let match = st.match(cnTimeRegex);
	
		if (match) {
			let [_, period, hourStr, minuteCnStr] = match;
			let hour = this.ea.editor.cn2num(hourStr);
			
			let minute = 0;
			if (minuteCnStr === '半') {
				minute = 30;
			} else if (minuteCnStr) {
				minute =  this.ea.editor.cn2num(minuteCnStr);
			}
			
			if (['下午'].includes(period)) {
				hour = hour >= 12 ? hour : hour + 12;
			} else if (['晚上'].includes(period)){
				hour = hour >=5 && hour<12? hour+12:hour;
			}else if (!period && nearest && hour<=12) {
				let t = moment();
				let a = t.hour()*60+t.minutes();
				let b = hour*60+minute;
				if(a>b && (a-b)>(b-a+12*60)){
					hour=hour+12;
				}
			}
	
			hour %= 24;
			let t = moment(`${date} ${hour}:${minute}`, "YYYY-MM-DD HH:mm");
			return this.snapTimeToBase(t, base);
		}
		return null
	}

	/**
	 * 从任意文本中提取第一时间片段，规则尽量与 {@link parse_time} 一致：
	 * - 数字：`HH:mm` / `HHmm`（两位小时，与 parse_time 整串相同）
	 * - 时段 + 阿拉伯：`早上6:45`、`晚上10:30`（与 parse_time 整串一致，转 24 小时制）
	 * - 中文：时段 + `…点` + `半` | 中文分 | 阿拉伯分（小时含「百」；分钟分支与 parse_time 对齐）
	 * - `现在`：解析为当前时刻的 `HH:mm`（与 {@link parse_time} 整串 `现在` 一致）
	 * - 无时段时可用 `nearest` 做 12 小时制消歧（与 parse_time 一致）
	 * - `base`：分钟对齐粒度（默认 5），向下取整到倍数，与 {@link parse_time} 的 `base` 一致
	 */
	extract_chinese_time(text: string, nearest = true, base = 5) {
		type Hit = { start: number; end: number; timeStr: string };
		let best: Hit | null = null;

		const dateStr = this.today.format('YYYY-MM-DD');

		// 数字时间（parse_time 的 ^(\d{2}):?(\d{2})$）
		const digRe = /(?<![0-9])(\d{2}):?(\d{2})(?![0-9])/g;
		let dm: RegExpExecArray | null;
		while ((dm = digRe.exec(text)) !== null) {
			const t = moment(`${dateStr} ${dm[1]}:${dm[2]}:00`, 'YYYY-MM-DD HH:mm:ss');
			if (t.isValid()) {
				const snapped = this.snapTimeToBase(t, base);
				const timeStr = `${String(snapped.hour()).padStart(2, '0')}:${String(snapped.minute()).padStart(2, '0')}`;
				const h: Hit = { start: dm.index, end: dm.index + dm[0].length, timeStr };
				if (best === null || h.start < best.start) {
					best = h;
				}
			}
		}

		const mixRe = /(凌晨|早上|上午|中午|下午|晚上|傍晚)\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/g;
		let mm: RegExpExecArray | null;
		while ((mm = mixRe.exec(text)) !== null) {
			let hour = parseInt(mm[2], 10);
			let minute = parseInt(mm[3], 10);
			if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
				continue;
			}
			const period = mm[1];
			if (period === '凌晨' && hour === 12) {
				hour = 0;
			} else if (['下午'].includes(period)) {
				hour = hour >= 12 ? hour : hour + 12;
			} else if (['晚上', '傍晚'].includes(period)) {
				hour = hour >= 5 && hour < 12 ? hour + 12 : hour;
			} else if (period === '中午') {
				if (hour > 0 && hour < 12) {
					hour += 12;
				}
			}
			hour %= 24;
			const snapped = this.snapTimeToBase(moment(`${dateStr} ${hour}:${minute}`, 'YYYY-MM-DD HH:mm'), base);
			const timeStr = `${String(snapped.hour()).padStart(2, '0')}:${String(snapped.minute()).padStart(2, '0')}`;
			const start = mm.index ?? 0;
			const h: Hit = { start, end: start + mm[0].length, timeStr };
			if (best === null || h.start < best.start) {
				best = h;
			}
		}

		// 中文时间（嵌入长句；点后的分支对齐 parse_time：半 | 中文分? | 数字分?）
		const cnRe =
			/(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*([零一二两三四五六七八九十百\d]+)\s*点\s*(?:(半)|([零一二两三四五六七八九十]+)\s*分?|([0-9]+)\s*分?)?/g;
		let cm: RegExpExecArray | null;
		while ((cm = cnRe.exec(text)) !== null) {
			let hour = this.ea.editor.cn2num(cm[2]);
			let minute = 0;
			if (cm[3] === '半') {
				minute = 30;
			} else if (cm[4] !== undefined && cm[4] !== '') {
				minute = this.ea.editor.cn2num(cm[4]);
			} else if (cm[5] !== undefined && cm[5] !== '') {
				minute = parseInt(cm[5], 10);
			}

			const period = cm[1];

			if (period === '凌晨' && hour === 12) {
				hour = 0;
			} else if (period && ['下午'].includes(period)) {
				hour = hour >= 12 ? hour : hour + 12;
			} else if (period && ['晚上', '傍晚'].includes(period)) {
				hour = hour >= 5 && hour < 12 ? hour + 12 : hour;
			} else if (period === '中午') {
				if (hour > 0 && hour < 12) {
					hour += 12;
				}
			} else if (!period && nearest && hour <= 12) {
				const now = moment();
				const a = now.hour() * 60 + now.minute();
				const b = hour * 60 + minute;
				if (a > b && a - b > b - a + 12 * 60) {
					hour = hour + 12;
				}
			}

			hour %= 24;
			const snapped = this.snapTimeToBase(moment(`${dateStr} ${hour}:${minute}`, 'YYYY-MM-DD HH:mm'), base);
			const timeStr = `${String(snapped.hour()).padStart(2, '0')}:${String(snapped.minute()).padStart(2, '0')}`;
			const start = cm.index ?? text.indexOf(cm[0]);
			const h: Hit = {
				start,
				end: start + cm[0].length,
				timeStr,
			};
			if (best === null || h.start < best.start) {
				best = h;
			}
		}

		const nowIdx = text.indexOf('现在');
		if (nowIdx !== -1) {
			const snapped = this.snapTimeToBase(moment(), base);
			const h: Hit = {
				start: nowIdx,
				end: nowIdx + 2,
				timeStr: `${String(snapped.hour()).padStart(2, '0')}:${String(snapped.minute()).padStart(2, '0')}`,
			};
			if (best === null || h.start < best.start) {
				best = h;
			}
		}

		if (best === null) {
			return { prefix: text, value: null, suffix: '' };
		}
		return {
			prefix: text.slice(0, best.start),
			time: best.timeStr,
			suffix: text.slice(best.end),
		};
	}
	
	
	time_plus_minutes(st:string,xt:string){
		let t = this.parse_time(st);
		let n = this.parse_minutes(xt);
		if(!t || typeof t == 'string' || Number.isNaN(n.duration)){return null}
		return t.clone().add(n.duration, 'minutes');
	}
	
	generate_start_times(jobs:Array<any>,delta=10, is_today = true,st:string|Moment='06:45',compress=true) {
        // 从 st 到当前时间
		let _st = this.parse_time(st)
		if(!_st){return []}
        st = _st;
        let timeList = [];
        let t = this.parse_time(moment().format('HH:mm'));
        if (!is_today || true) {
            t = this.parse_time(moment().format('23:59'));
        }
		if(!t){return []}
        for (let hour = st.hour(); hour <= t.hour(); hour++) {
            let startMinute = (hour === st.hour()) ? st.minute() : 0;
            let endMinute = (hour === t.hour()) ? t.minute()+1 : 60;
            for (let minute = startMinute; minute < endMinute; minute += delta) {
                let time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                let ct = this.parse_time(time);
				if(!ct){continue}
                let flag = true;
                for (let item of jobs) {
                    if (item.st <= ct && item.et > ct) {
                        flag = false;
                        break;
                    }
                }
                if (flag) {
                    timeList.push(time);
                }
            }
        }
        let et = this.get_max_endt(jobs)?.format('HH:mm');
        if (et && !timeList.contains(et)) {
            timeList.push(et)
        }
        timeList = timeList.sort((a, b) => -a.localeCompare(b));
		if(compress){
			return this.compress_timelist(timeList,delta)
		}else{
			return timeList
		}
        
    }

	get_max_endt(jobs:Array<any>,st='06:45') {
        if (jobs.length == 0) {
            return this.parse_time(st)
        } else {
            return moment.unix(
                Math.max(...jobs.map(x => x.et)) / 1000
            )
        }
    }

	compress_timelist(timeList:Array<string>,delta=5){
		let compressedList = [];
		let startRange = null;
		let prevTime = null;
	
		for (let i = 0; i < timeList.length; i++) {
			let currentTime = timeList[i];
			let currentParsed = this.parse_time(currentTime);
			if(!currentParsed){continue}
			
			if (prevTime === null) {
				startRange = currentTime;
			} else {
				let prevParsed = this.parse_time(prevTime);
				if(!prevParsed){continue}
				// 检查是否连续（相差5分钟）
				let diffMinutes = (prevParsed.hour() * 60 + prevParsed.minute()) - 
								   (currentParsed.hour() * 60 + currentParsed.minute());
				
				if (diffMinutes !== delta) {
					if (startRange !== prevTime) {
						compressedList.push(startRange)
						compressedList.push(prevTime);
					} else {
						compressedList.push(startRange);
					}
					startRange = currentTime;
				}
			}
			
			prevTime = currentTime;
		}
	
		// 处理最后一个范围
		if (startRange !== prevTime) {
			compressedList.push(startRange)
			compressedList.push(prevTime);
		} else if (prevTime !== null) {
			compressedList.push(prevTime);
		}
	
		return compressedList;
	}
}