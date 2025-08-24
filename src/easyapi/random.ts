import { App, TFile,moment } from "obsidian";
import { EasyAPI } from "./easyapi";


export class Random {
    app:App;
    ea:EasyAPI;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

    /**
   * 随机获取 M 个值，位于 0～N 之间
   * @param {number} N - 最大值（不包含）
   * @param {number} M - 需要获取的随机数数量
   * @param {boolean} repeat - 是否允许重复值
   * @returns {number[]} - 包含 M 个随机数的数组
   */
    random_number(N:number, M:number, repeat = false) {
        if (M <= 0) return [];
        if (!repeat && M > N) {
            throw new Error("当不允许重复时，M 不能大于 N");
        }

        const result = [];

        if (repeat) {
            // 允许重复值的情况
            for (let i = 0; i < M; i++) {
                result.push(Math.floor(Math.random() * N));
            }
        } else {
            // 不允许重复值的情况
            const numbers = Array.from({ length: N }, (_, i) => i);

            // 使用 Fisher-Yates 洗牌算法
            for (let i = numbers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
            }

            // 取前 M 个
            result.push(...numbers.slice(0, M));
        }

        return result;
    }

    // 线性同余生成器 (LCG)
    lcg(seed:number) {
        const a = 1664525;
        const c = 1013904223;
        const m = Math.pow(2, 32);
        return (a * seed + c) % m;
    }

    /**
     * 基于日期生成固定随机数序列
     * @param {moment} t - 时间对象（使用moment.js）
     * @param {number} N - 随机数范围上限（0到N-1）
     * @param {number} M - 需要的随机数数量
     * @returns {number[]} - 排序后的随机数数组
     */
    random_number_for_date(t:moment.Moment, N:number, M:number) {
        if (M <= 0) return [];
        if (M >= N) return Array.from({length: N}, (_, i) => i);

        // 使用年月日作为种子，确保同一天生成相同的序列
        const dateStr = t.format('YYYY-MM-DD');
        let seed = 0;
        for (let i = 0; i < dateStr.length; i++) {
            seed = (seed << 5) - seed + dateStr.charCodeAt(i);
            seed |= 0; // 转换为32位整数
        }

        // 使用Fisher-Yates算法生成随机排列
        const numbers = Array.from({length: N}, (_, i) => i);
        let currentSeed = seed;
        
        for (let i = N - 1; i > 0; i--) {
            currentSeed = this.lcg(currentSeed);
            const j = Math.abs(currentSeed) % (i + 1);
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        // 取前M个并排序
        return numbers.slice(0, M).sort((a, b) => a - b);
    }

    // 根据字符串返回 0~N 之间的整数
    string_to_random_number(str:string, N:number) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0; // 转换为32位整数
        }
        return Math.abs(hash) % N;
    }

    // 从数组中随机获取 N 个元素
    random_elements(arr:any[], n:number ) {
        // 复制数组避免修改原数组
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // 交换
        }
        return shuffled.slice(0, n); // 取前N个
    }

	_get_tfiles_(filter:null|Function){
		let tfiles = this.ea.nc.chain.get_all_tfiles();
		if(filter){
			tfiles = tfiles.filter((x:TFile)=>filter(x))
		}
		return tfiles;
	}
	random_notes(n=3,filter=null){
		let tfiles = this._get_tfiles_(filter);
		let idx = this.random_number(tfiles.length,n)
		tfiles = idx.map(i=>tfiles[i])
		return tfiles
	}

    random_daily_notes(n=3,before_today=true,filter=null){
		let t = moment(moment().format('YYYY-MM-DD') )
		let dnote = this.ea.nc.chain.get_last_daily_note()
		if(dnote){
			t = moment(dnote.basename)
		}
		let tfiles = this._get_tfiles_(filter);

		if(before_today){
			tfiles = tfiles.filter(
				(f:TFile)=>f.stat.ctime<t.unix()*1000
			)
		}
		let idx = this.random_number_for_date(t,tfiles.length,n)
		tfiles = idx.map(i=>tfiles[i])
		return tfiles
    }
}