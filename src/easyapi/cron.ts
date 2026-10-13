import { Notice } from 'obsidian';
import { errorMessage } from '../ts-helpers';

/**
 * Templater:
 * ```js
 * ea.cron.set_daily_job('08:00', 'open_daily', () => {
 *   ea.tpl.parse_templater('打开当日日记.md');
 * });
 * ea.cron.set_weekly_job('09:00', '周一', 'weekly_report', () => {
 *   ea.tpl.parse_templater('写周报.md');
 * });
 * ea.cron.get_daily_jobs();
 * ```
 * 每日任务等到下一个 `HH:MM` 再跑，之后每个自然日同一时刻再跑。
 * 每周任务等到下一个指定星期的 `HH:MM` 再跑，之后每 7 天再跑。同名会替换已有任务。
 */

type DailyJobFn = () => void | Promise<void>;

export interface DailyJobInfo {
	name: string;
	/** `HH:MM`。 */
	time: string;
	/** `0`–`6`，`0` 为周日。每日任务为 `null`。 */
	weekday: number | null;
	/** 下一次运行的本地时间，`YYYY-MM-DD HH:mm:ss`。 */
	next: string;
}

interface DailyJobHandle {
	name: string;
	time: string;
	weekday: number | null;
	job: DailyJobFn;
	timer: number;
	/** 已排定的下一次运行，毫秒时间戳。 */
	nextAt: number;
	generation: number;
}

export class Cron {
	private jobs = new Map<string, DailyJobHandle>();

	/**
	 * 创建每日定时任务。`time` 为 `HH:MM`（也接受 `H:MM`）。
	 * 若今天该时刻已过，则从明天开始。返回是否已排上。
	 */
	set_daily_job(time: string, job_name: string, job: DailyJobFn): boolean {
		const hhmm = normalizeClock(time);
		const name = job_name.trim();
		if (!hhmm) {
			new Notice(`每日任务时间无效：${time}`);
			return false;
		}
		if (!name) {
			new Notice('每日任务需要名称');
			return false;
		}
		if (typeof job !== 'function') {
			new Notice(`每日任务 ${name} 缺少函数`);
			return false;
		}
		this.place(name, hhmm, null, job);
		return true;
	}

	/**
	 * 创建每周定时任务。`time` 为 `HH:MM`（也接受 `H:MM`）。
	 * `weekday` 为 `周一` / `星期一` / `礼拜一`，或数字：`0` 与 `7` 为周日，`1` 为周一，…，`6` 为周六。
	 * 若本周该时刻已过，则从下周开始。返回是否已排上。
	 */
	set_weekly_job(time: string, weekday: number | string, job_name: string, job: DailyJobFn): boolean {
		const hhmm = normalizeClock(time);
		const day = normalizeWeekday(weekday);
		const name = job_name.trim();
		if (!hhmm) {
			new Notice(`每周任务时间无效：${time}`);
			return false;
		}
		if (day == null) {
			new Notice(`每周任务星期无效：${String(weekday)}`);
			return false;
		}
		if (!name) {
			new Notice('每周任务需要名称');
			return false;
		}
		if (typeof job !== 'function') {
			new Notice(`每周任务 ${name} 缺少函数`);
			return false;
		}
		this.place(name, hhmm, day, job);
		return true;
	}

	/** 当前已排上的定时任务（每日和每周），按下一次运行时间再按名称排序。 */
	get_daily_jobs(): DailyJobInfo[] {
		return [...this.jobs.values()]
			.sort((a, b) => a.nextAt - b.nextAt || a.name.localeCompare(b.name))
			.map((job) => ({
				name: job.name,
				time: job.time,
				weekday: job.weekday,
				next: formatLocal(job.nextAt),
			}));
	}

	/** 取消一个定时任务。名称不存在时无操作。 */
	clear_daily_job(job_name: string): void {
		const handle = this.jobs.get(job_name.trim());
		if (!handle) return;
		window.clearTimeout(handle.timer);
		handle.generation += 1;
		this.jobs.delete(handle.name);
	}

	/** 取消全部定时任务。插件卸载时调用。 */
	clear(): void {
		for (const name of [...this.jobs.keys()]) {
			this.clear_daily_job(name);
		}
	}

	private place(name: string, time: string, weekday: number | null, job: DailyJobFn): void {
		this.clear_daily_job(name);
		const handle: DailyJobHandle = {
			name,
			time,
			weekday,
			job,
			timer: 0,
			nextAt: 0,
			generation: 0,
		};
		this.jobs.set(name, handle);
		this.arm(handle);
	}

	private arm(handle: DailyJobHandle): void {
		const generation = ++handle.generation;
		const nextAt = nextRun(handle.time, handle.weekday).getTime();
		handle.nextAt = nextAt;
		handle.timer = window.setTimeout(() => {
			void this.fire(handle.name, generation);
		}, Math.max(0, nextAt - Date.now()));
	}

	private async fire(name: string, generation: number): Promise<void> {
		const handle = this.jobs.get(name);
		if (!handle || handle.generation !== generation) return;
		try {
			await handle.job();
		} catch (err) {
			new Notice(`定时任务 ${name} 失败：${errorMessage(err)}`);
		}
		const after = this.jobs.get(name);
		if (!after || after.generation !== generation) return;
		this.arm(after);
	}
}

function normalizeClock(time: string): string | null {
	const matched = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	if (!matched) return null;
	const hour = parseInt(matched[1], 10);
	const minute = parseInt(matched[2], 10);
	if (hour > 23 || minute > 59) return null;
	return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** `0`/`7`/日/天 为周日，`1`/一 为周一，…，`6`/六 为周六。 */
function normalizeWeekday(value: number | string): number | null {
	if (typeof value === 'number') {
		if (!Number.isInteger(value)) return null;
		if (value === 7) return 0;
		if (value >= 0 && value <= 6) return value;
		return null;
	}
	const text = value.trim().replace(/^(星期|周|礼拜)/, '');
	const map: Record<string, number> = {
		'日': 0, '天': 0, '七': 0, '0': 0, '7': 0,
		'一': 1, '1': 1,
		'二': 2, '2': 2,
		'三': 3, '3': 3,
		'四': 4, '4': 4,
		'五': 5, '5': 5,
		'六': 6, '6': 6,
	};
	return map[text] ?? null;
}

function nextRun(hhmm: string, weekday: number | null, from = new Date()): Date {
	const hour = parseInt(hhmm.slice(0, 2), 10);
	const minute = parseInt(hhmm.slice(3), 10);
	const next = new Date(from);
	if (weekday != null) {
		const delta = (weekday - next.getDay() + 7) % 7;
		next.setDate(next.getDate() + delta);
	}
	next.setHours(hour, minute, 0, 0);
	if (next.getTime() <= from.getTime()) {
		next.setDate(next.getDate() + (weekday == null ? 1 : 7));
	}
	return next;
}

function formatLocal(ms: number): string {
	const date = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
