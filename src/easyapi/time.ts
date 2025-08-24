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

	

	parse_minutes(xt:string) {
		if(typeof xt == 'number'){return xt;}
		if(xt.match(/^\d*$/) && parseInt(xt)){return parseInt(xt);}
		
		let items = xt.match(/^(.{1,2})个半小时$/);
		if(items){return this.ea.editor.cn2num(items[1])*60+30}
	
		let compoundMatch = xt.match(/^(.*?)(h|hour|hours|时|小时|个小时)(.*?)(m|min|minute|minutes|分|分钟)?$/i);
		if (compoundMatch) {
			let hours = this.ea.editor.cn2num(compoundMatch[1]) || 0;
			let minutes = this.ea.editor.cn2num(compoundMatch[3]) || 0;
			return Math.round(hours * 60 + minutes);
		}
		// 处理简单格式，仅分钟
		let simpleMatch = xt.match(/^(.*?)(m|min|minute|minutes|分|分钟)$/i);
		if (simpleMatch) {
			let value = this.ea.editor.cn2num(simpleMatch[1]);
			return Math.round(value);
		}
		return Number.NaN; 
	}
	
	
	parse_time(st:string|Moment, date:Moment|string = this.today,nearest=true) {
		if(!st){return null}
		if(moment.isMoment(st)){return st}

		if(moment.isMoment(date)){
			date = date.format('YYYY-MM-DD');
		}

		let items = st.match(/^(\d{2}):?(\d{2})$/);

		if(items){
			let t = moment(`${date} ${items[1]}:${items[2]}:00`, "YYYY-MM-DD HH:mm:ss");
			if(t.isValid()){return t}
		}
	
		let cnTimeRegex = /^(早上|上午|凌晨|下午|晚上)?([零一二三四五六七八九十百]+|[\d]+)点(半|([零一二三四五六七八九十]+)分?|([\d]+)分?)?$/;
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
			return moment(`${date} ${hour}:${minute}`, "YYYY-MM-DD HH:mm");
		}
		return null
	}
	
	time_plus_minutes(st:string,xt:string){
		let t = this.parse_time(st);
		let n = this.parse_minutes(xt);
		if(!t || typeof t == 'string' || Number.isNaN(n)){return null}
		return t.clone().add(xt, 'minutes');
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