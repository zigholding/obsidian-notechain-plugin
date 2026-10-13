import { Notice } from 'obsidian';
import { errorMessage } from '../ts-helpers';

/**
 * Templater:
 * ```js
 * ea.cron.set_daily_job('08:00', 'open_daily', () => {
 *   ea.tpl.parse_templater('打开当日日记.md');
 * });
 * ```
 * 等到下一个 `HH:MM` 再跑，之后每个自然日的同一时刻再跑。同名会替换已有任务。
 */

type DailyJobFn = () => void | Promise<void>;

interface DailyJobHandle {
	name: string;
	time: string;
	job: DailyJobFn;
	timer: number;
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
		this.clear_daily_job(name);
		const handle: DailyJobHandle = {
			name,
			time: hhmm,
			job,
			timer: 0,
			generation: 0,
		};
		this.jobs.set(name, handle);
		this.arm(handle);
		return true;
	}

	/** 取消一个每日任务。名称不存在时无操作。 */
	clear_daily_job(job_name: string): void {
		const handle = this.jobs.get(job_name.trim());
		if (!handle) return;
		window.clearTimeout(handle.timer);
		handle.generation += 1;
		this.jobs.delete(handle.name);
	}

	/** 取消全部每日任务。插件卸载时调用。 */
	clear(): void {
		for (const name of [...this.jobs.keys()]) {
			this.clear_daily_job(name);
		}
	}

	private arm(handle: DailyJobHandle): void {
		const generation = ++handle.generation;
		const delay = msUntil(handle.time);
		handle.timer = window.setTimeout(() => {
			void this.fire(handle.name, generation);
		}, delay);
	}

	private async fire(name: string, generation: number): Promise<void> {
		const handle = this.jobs.get(name);
		if (!handle || handle.generation !== generation) return;
		try {
			await handle.job();
		} catch (err) {
			new Notice(`每日任务 ${name} 失败：${errorMessage(err)}`);
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

function msUntil(hhmm: string): number {
	const hour = parseInt(hhmm.slice(0, 2), 10);
	const minute = parseInt(hhmm.slice(3), 10);
	const now = new Date();
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	if (next.getTime() <= now.getTime()) {
		next.setDate(next.getDate() + 1);
	}
	return next.getTime() - now.getTime();
}
