import { App, Modal, setIcon } from "obsidian";

// ── Data types ──────────────────────────────────────────────────────────────

export interface ImageItem {
	path: string;
	thumbnail?: string;
	caption?: string;
}

export interface AudioItem {
	path: string;
	duration?: number;
	title?: string;
}

export interface DayData {
	date: string;
	text?: string;
	images: ImageItem[];
	audios: AudioItem[];
}

export interface MonthlyData {
	year: number;
	month: number;
	days: DayData[];
}

export interface CalendarGalleryOptions {
	getMonthlyData: (date: Date) => Promise<MonthlyData>;
	onOpenDay?: (day: DayData) => void;
	onOpenImage?: (image: ImageItem) => void;
	onPlayAudio?: (audio: AudioItem) => void;
	weekStart?: "Sunday" | "Monday";
	cardSize?: "small" | "medium" | "large";
	showTooltip?: boolean;
	showAudio?: boolean;
	animation?: boolean;
	width?: number;
	height?: number;
}

type ResolvedOptions = Required<
	Omit<CalendarGalleryOptions, "onOpenDay" | "onOpenImage" | "onPlayAudio">
> &
	Pick<CalendarGalleryOptions, "onOpenDay" | "onOpenImage" | "onPlayAudio">;

const DEFAULT_OPTIONS: ResolvedOptions = {
	getMonthlyData: async () => ({ year: 0, month: 0, days: [] }),
	weekStart: "Monday",
	cardSize: "medium",
	showTooltip: true,
	showAudio: true,
	animation: true,
	width: 1100,
	height: 780,
};

const CARD_HEIGHTS: Record<ResolvedOptions["cardSize"], number> = {
	small: 88,
	medium: 108,
	large: 132,
};

const WEEK_LABELS_SUN = ["日", "一", "二", "三", "四", "五", "六"];
const WEEK_LABELS_MON = ["一", "二", "三", "四", "五", "六", "日"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function dateKey(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
	const [y, m, d] = key.split("-").map(Number);
	return { year: y, month: m, day: d };
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
	const d = new Date(year, month - 1 + delta, 1);
	return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthCacheKey(year: number, month: number): string {
	return `${year}-${month}`;
}

function stripMarkdown(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]+`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/^>\s?/gm, "")
		.replace(/^[-*+]\s+/gm, "")
		.replace(/^\d+\.\s+/gm, "")
		.replace(/\|/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function formatDuration(sec?: number): string {
	if (sec == null || !Number.isFinite(sec)) return "";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface CalendarCell {
	year: number;
	month: number;
	day: number;
	inCurrentMonth: boolean;
	key: string;
}

function buildCalendarGrid(year: number, month: number, weekStart: "Sunday" | "Monday"): CalendarCell[] {
	const firstDow = new Date(year, month - 1, 1).getDay();
	const offset = weekStart === "Monday" ? (firstDow + 6) % 7 : firstDow;
	const totalDays = daysInMonth(year, month);
	const cells: CalendarCell[] = [];

	for (let i = 0; i < 42; i++) {
		const dayNum = i - offset + 1;
		let cy = year;
		let cm = month;
		let cd = dayNum;

		if (dayNum < 1) {
			const prev = shiftMonth(year, month, -1);
			cy = prev.year;
			cm = prev.month;
			cd = daysInMonth(cy, cm) + dayNum;
		} else if (dayNum > totalDays) {
			const next = shiftMonth(year, month, 1);
			cy = next.year;
			cm = next.month;
			cd = dayNum - totalDays;
		}

		cells.push({
			year: cy,
			month: cm,
			day: cd,
			inCurrentMonth: cy === year && cm === month,
			key: dateKey(cy, cm, cd),
		});
	}
	return cells;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export class CalendarGalleryModal extends Modal {
	private options: ResolvedOptions;
	private currentYear: number;
	private currentMonth: number;
	private selectedKey: string | null = null;
	private monthCache = new Map<string, MonthlyData>();
	private loadingMonths = new Set<string>();
	private renderSession = 0;

	private headerEl!: HTMLElement;
	private gridEl!: HTMLElement;
	private tooltipEl!: HTMLElement;
	private slideDir: "left" | "right" | null = null;

	constructor(app: App, options: CalendarGalleryOptions) {
		super(app);
		this.options = { ...DEFAULT_OPTIONS, ...options };
		const now = new Date();
		this.currentYear = now.getFullYear();
		this.currentMonth = now.getMonth() + 1;
		this.selectedKey = dateKey(this.currentYear, this.currentMonth, now.getDate());
	}

	onOpen(): void {
		this.modalEl.addClass("nc-calendar-gallery-modal");
		this.modalEl.style.width = `${this.options.width}px`;
		this.modalEl.style.height = `${this.options.height}px`;

		const resizer = this.modalEl.createDiv({ cls: "nc-modal-resizer" });
		this.initResizer(resizer);

		this.tooltipEl = document.body.createDiv({ cls: "nc-cal-tooltip" });
		this.tooltipEl.hide();

		this.renderShell();
		void this.loadAndRenderMonth(this.currentYear, this.currentMonth, true);
		this.preloadAdjacentMonths(this.currentYear, this.currentMonth);

		this.modalEl.addEventListener("keydown", this.onKeyDown);
	}

	onClose(): void {
		this.renderSession++;
		this.modalEl.removeEventListener("keydown", this.onKeyDown);
		this.tooltipEl?.remove();
		this.contentEl.empty();
	}

	refresh(): void {
		this.monthCache.delete(monthCacheKey(this.currentYear, this.currentMonth));
		void this.loadAndRenderMonth(this.currentYear, this.currentMonth, true);
	}

	refreshMonth(date: Date): void {
		const y = date.getFullYear();
		const m = date.getMonth() + 1;
		this.monthCache.delete(monthCacheKey(y, m));
		if (y === this.currentYear && m === this.currentMonth) {
			void this.loadAndRenderMonth(y, m, true);
		}
	}

	refreshDay(date: Date): void {
		const y = date.getFullYear();
		const m = date.getMonth() + 1;
		const key = dateKey(y, m, date.getDate());
		const cached = this.monthCache.get(monthCacheKey(y, m));
		if (!cached) {
			this.refreshMonth(date);
			return;
		}
		const cell = this.gridEl?.querySelector(`[data-date="${key}"]`) as HTMLElement | null;
		if (cell) {
			const dayMap = this.buildDayMap(cached);
			this.updateDayCard(cell, key, dayMap.get(key), y, m);
		}
	}

	// ── Shell ─────────────────────────────────────────────────────────────────

	private renderShell(): void {
		const session = ++this.renderSession;
		this.contentEl.empty();

		this.headerEl = this.contentEl.createDiv({ cls: "nc-cal-header" });
		this.contentEl.createDiv({ cls: "nc-cal-week-header" });
		const body = this.contentEl.createDiv({ cls: "nc-cal-body" });
		this.gridEl = body.createDiv({ cls: "nc-cal-grid" });
		this.gridEl.style.setProperty("--nc-cal-card-height", `${CARD_HEIGHTS[this.options.cardSize]}px`);

		this.renderHeader();
		this.renderWeekHeader();
		if (session !== this.renderSession) return;
		this.renderSkeleton();
	}

	private renderHeader(): void {
		this.headerEl.empty();

		const leftSpacer = this.headerEl.createDiv({ cls: "nc-cal-header-side" });

		const center = this.headerEl.createDiv({ cls: "nc-cal-header-center" });
		const prevBtn = center.createDiv({ cls: "nc-icon-btn", attr: { title: "上一月", "aria-label": "上一月" } });
		setIcon(prevBtn, "chevron-left");
		prevBtn.onclick = () => void this.changeMonth(-1);

		const titleEl = center.createDiv({ cls: "nc-cal-title" });

		const nextBtn = center.createDiv({ cls: "nc-icon-btn", attr: { title: "下一月", "aria-label": "下一月" } });
		setIcon(nextBtn, "chevron-right");
		nextBtn.onclick = () => void this.changeMonth(1);

		const rightSide = this.headerEl.createDiv({ cls: "nc-cal-header-side" });
		const todayBtn = rightSide.createDiv({ cls: "nc-cal-today-btn", text: "今天", attr: { title: "回到今天" } });
		todayBtn.onclick = () => void this.goToToday();

		this.updateHeaderTitle(titleEl);

		this.headerEl.addEventListener(
			"wheel",
			(e) => {
				if (Math.abs(e.deltaY) < 8) return;
				e.preventDefault();
				void this.changeMonth(e.deltaY > 0 ? 1 : -1);
			},
			{ passive: false }
		);
	}

	private updateHeaderTitle(titleEl?: HTMLElement): void {
		const el = titleEl ?? this.headerEl?.querySelector(".nc-cal-title");
		if (el) el.setText(`${this.currentYear} 年 ${this.currentMonth} 月`);
	}

	private renderWeekHeader(): void {
		const weekHeader = this.contentEl.querySelector(".nc-cal-week-header") as HTMLElement;
		if (!weekHeader) return;
		weekHeader.empty();
		const labels = this.options.weekStart === "Monday" ? WEEK_LABELS_MON : WEEK_LABELS_SUN;
		labels.forEach((label) => {
			weekHeader.createDiv({ cls: "nc-cal-week-cell", text: label });
		});
	}

	private renderSkeleton(): void {
		this.gridEl.empty();
		this.gridEl.addClass("is-loading");
		for (let i = 0; i < 42; i++) {
			this.gridEl.createDiv({ cls: "nc-cal-day-card is-skeleton" });
		}
	}

	// ── Data loading ──────────────────────────────────────────────────────────

	private async fetchMonth(year: number, month: number): Promise<MonthlyData> {
		const key = monthCacheKey(year, month);
		const cached = this.monthCache.get(key);
		if (cached) return cached;

		if (this.loadingMonths.has(key)) {
			await this.waitForMonth(key);
			return this.monthCache.get(key)!;
		}

		this.loadingMonths.add(key);
		try {
			const data = await this.options.getMonthlyData(new Date(year, month - 1, 1));
			this.monthCache.set(key, data);
			return data;
		} finally {
			this.loadingMonths.delete(key);
		}
	}

	private waitForMonth(key: string): Promise<void> {
		return new Promise((resolve) => {
			const check = () => {
				if (this.monthCache.has(key) || !this.loadingMonths.has(key)) {
					resolve();
				} else {
					requestAnimationFrame(check);
				}
			};
			check();
		});
	}

	private preloadAdjacentMonths(year: number, month: number): void {
		const prev = shiftMonth(year, month, -1);
		const next = shiftMonth(year, month, 1);
		void this.fetchMonth(prev.year, prev.month);
		void this.fetchMonth(next.year, next.month);
	}

	private async loadAndRenderMonth(year: number, month: number, forceGrid = false): Promise<void> {
		const session = this.renderSession;
		if (forceGrid) this.renderSkeleton();

		await this.fetchMonth(year, month);
		if (session !== this.renderSession) return;

		this.renderGrid();
		this.preloadAdjacentMonths(year, month);
	}

	private async changeMonth(delta: number): Promise<void> {
		this.slideDir = delta > 0 ? "left" : "right";
		const next = shiftMonth(this.currentYear, this.currentMonth, delta);
		this.currentYear = next.year;
		this.currentMonth = next.month;
		this.updateHeaderTitle();
		await this.loadAndRenderMonth(this.currentYear, this.currentMonth, true);
	}

	private async goToToday(): Promise<void> {
		const now = new Date();
		this.currentYear = now.getFullYear();
		this.currentMonth = now.getMonth() + 1;
		this.selectedKey = dateKey(this.currentYear, this.currentMonth, now.getDate());
		this.updateHeaderTitle();
		await this.loadAndRenderMonth(this.currentYear, this.currentMonth, true);
	}

	// ── Grid rendering ────────────────────────────────────────────────────────

	private buildDayMap(data: MonthlyData): Map<string, DayData> {
		const map = new Map<string, DayData>();
		for (const day of data.days) {
			map.set(day.date, day);
		}
		return map;
	}

	private renderGrid(): void {
		const session = this.renderSession;
		const cells = buildCalendarGrid(this.currentYear, this.currentMonth, this.options.weekStart);
		const mainData = this.monthCache.get(monthCacheKey(this.currentYear, this.currentMonth));
		const mainMap = mainData ? this.buildDayMap(mainData) : new Map<string, DayData>();

		this.gridEl.empty();
		this.gridEl.removeClass("is-loading");

		if (this.options.animation && this.slideDir) {
			this.gridEl.addClass(`nc-cal-slide-${this.slideDir}`);
			this.slideDir = null;
			window.setTimeout(() => this.gridEl?.removeClass("nc-cal-slide-left", "nc-cal-slide-right"), 280);
		}

		const todayKey = dateKey(
			new Date().getFullYear(),
			new Date().getMonth() + 1,
			new Date().getDate()
		);

		cells.forEach((cell, index) => {
			let dayData = mainMap.get(cell.key);
			if (!dayData && !cell.inCurrentMonth) {
				const adj = this.monthCache.get(monthCacheKey(cell.year, cell.month));
				if (adj) dayData = this.buildDayMap(adj).get(cell.key);
			}

			const card = this.createDayCard(cell, dayData, todayKey, index);
			if (session !== this.renderSession) return;
			this.gridEl.appendChild(card);
		});
	}

	private createDayCard(
		cell: CalendarCell,
		dayData: DayData | undefined,
		todayKey: string,
		index: number
	): HTMLElement {
		const card = document.createElement("div");
		card.className = "nc-cal-day-card";
		card.dataset.date = cell.key;
		card.dataset.index = String(index);
		card.setAttr("tabindex", "0");
		card.setAttr("role", "gridcell");
		card.setAttr("aria-label", cell.key);

		if (!cell.inCurrentMonth) card.addClass("is-other-month");
		if (cell.key === todayKey) card.addClass("is-today");
		if (cell.key === this.selectedKey) card.addClass("is-selected");

		const topRow = card.createDiv({ cls: "nc-cal-day-top" });
		topRow.createDiv({ cls: "nc-cal-day-num", text: String(cell.day) });

		const badges = topRow.createDiv({ cls: "nc-cal-badges" });
		const imgCount = dayData?.images?.length ?? 0;
		const audioCount = dayData?.audios?.length ?? 0;
		if (imgCount > 0) badges.createSpan({ cls: "nc-cal-badge", text: `📷${imgCount}` });
		if (audioCount > 0 && this.options.showAudio) {
			badges.createSpan({ cls: "nc-cal-badge", text: `🎤${audioCount}` });
		}

		const body = card.createDiv({ cls: "nc-cal-day-body" });
		const images = dayData?.images ?? [];
		const audios = dayData?.audios ?? [];

		if (images.length > 0) {
			this.renderImageArea(body, images, card);
		}
		if (audios.length > 0 && this.options.showAudio) {
			this.renderAudioArea(body, audios);
		}

		card.onclick = (e) => {
			const target = e.target as HTMLElement;
			if (target.closest(".nc-cal-carousel-btn, .nc-cal-audio-btn, .nc-cal-img-wrap, .nc-cal-audio-wrap")) return;
			this.selectedKey = cell.key;
			this.gridEl.querySelectorAll(".is-selected").forEach((el) => el.removeClass("is-selected"));
			card.addClass("is-selected");
			if (dayData) this.options.onOpenDay?.(dayData);
		};

		if (this.options.showTooltip && dayData?.text) {
			const plain = stripMarkdown(dayData.text).slice(0, 300);
			if (plain) {
				card.addEventListener("mouseenter", () => this.showTooltip(card, plain));
				card.addEventListener("mouseleave", () => this.hideTooltip());
			}
		}

		return card;
	}

	private updateDayCard(
		card: HTMLElement,
		key: string,
		dayData: DayData | undefined,
		year: number,
		month: number
	): void {
		const cell = buildCalendarGrid(year, month, this.options.weekStart).find((c) => c.key === key);
		if (!cell) return;
		const parent = card.parentElement;
		const index = Number(card.dataset.index ?? 0);
		const todayKey = dateKey(
			new Date().getFullYear(),
			new Date().getMonth() + 1,
			new Date().getDate()
		);
		const newCard = this.createDayCard(cell, dayData, todayKey, index);
		parent?.replaceChild(newCard, card);
	}

	// ── Image area ────────────────────────────────────────────────────────────

	private renderImageArea(container: HTMLElement, images: ImageItem[], card: HTMLElement): void {
		const wrap = container.createDiv({ cls: "nc-cal-img-wrap" });
		const imgEl = wrap.createEl("img", { cls: "nc-cal-img" });
		imgEl.setAttr("loading", "lazy");
		imgEl.setAttr("draggable", "false");
		imgEl.setAttr("alt", images[0].caption ?? images[0].path);

		let current = 0;
		const session = this.renderSession;
		let dots: HTMLElement | null = null;

		const setImage = (idx: number) => {
			current = ((idx % images.length) + images.length) % images.length;
			const item = images[current];
			const src = item.thumbnail ?? item.path;
			this.resolveImageSrc(src, imgEl, session);
			dots?.querySelectorAll(".nc-cal-dot").forEach((d, i) => {
				d.toggleClass("is-active", i === current);
			});
		};

		imgEl.onclick = (e) => {
			e.stopPropagation();
			this.options.onOpenImage?.(images[current]);
		};

		imgEl.onerror = () => {
			imgEl.hide();
			const ph = wrap.createDiv({ cls: "nc-cal-img-placeholder" });
			setIcon(ph, "image-off");
		};

		if (images.length > 1) {
			const prev = wrap.createDiv({ cls: "nc-cal-carousel-btn nc-cal-carousel-prev", attr: { "aria-label": "上一张" } });
			setIcon(prev, "chevron-left");
			const next = wrap.createDiv({ cls: "nc-cal-carousel-btn nc-cal-carousel-next", attr: { "aria-label": "下一张" } });
			setIcon(next, "chevron-right");
			prev.onclick = (e) => { e.stopPropagation(); setImage(current - 1); };
			next.onclick = (e) => { e.stopPropagation(); setImage(current + 1); };

			dots = wrap.createDiv({ cls: "nc-cal-dots" });
			images.forEach((_, i) => {
				dots!.createDiv({ cls: `nc-cal-dot${i === 0 ? " is-active" : ""}` });
			});

			wrap.addEventListener("wheel", (e) => {
				e.preventDefault();
				e.stopPropagation();
				setImage(current + (e.deltaY > 0 ? 1 : -1));
			}, { passive: false });
		}

		setImage(0);

		if (this.options.animation) wrap.addClass("nc-cal-fade");
	}

	private resolveImageSrc(src: string, imgEl: HTMLImageElement, session: number): void {
		if (/^(https?:\/\/|data:|app:\/\/|\/|\\)/.test(src)) {
			imgEl.src = src;
			imgEl.show();
			return;
		}
		if (/\.(png|jpe?g|gif|webp|svg)/i.test(src)) {
			(async () => {
				try {
					if (session !== this.renderSession) return;
					const nc = (this.app as any).plugins?.plugins?.["note-chain"];
					const dataUrl = await nc?.easyapi?.file?.read_binary_to_base64(src);
					if (session !== this.renderSession || !dataUrl) return;
					imgEl.src = dataUrl;
					imgEl.show();
				} catch {
					imgEl.dispatchEvent(new Event("error"));
				}
			})();
		}
	}

	// ── Audio area ────────────────────────────────────────────────────────────

	private renderAudioArea(container: HTMLElement, audios: AudioItem[]): void {
		const wrap = container.createDiv({ cls: "nc-cal-audio-wrap" });
		let current = 0;

		const label = wrap.createDiv({ cls: "nc-cal-audio-label" });
		const nav = wrap.createDiv({ cls: "nc-cal-audio-nav" });

		const update = () => {
			const item = audios[current];
			const title = item.title ?? "Voice";
			const dur = formatDuration(item.duration);
			label.setText(dur ? `🎤 ${title} · ${dur}` : `🎤 ${title}`);
		};

		update();

		wrap.onclick = (e) => {
			e.stopPropagation();
			this.options.onPlayAudio?.(audios[current]);
		};

		if (audios.length > 1) {
			const prev = nav.createDiv({ cls: "nc-cal-audio-btn", text: "◀", attr: { "aria-label": "上一段录音" } });
			nav.createSpan({ cls: "nc-cal-audio-title" });
			const next = nav.createDiv({ cls: "nc-cal-audio-btn", text: "▶", attr: { "aria-label": "下一段录音" } });
			prev.onclick = (e) => { e.stopPropagation(); current = (current - 1 + audios.length) % audios.length; update(); };
			next.onclick = (e) => { e.stopPropagation(); current = (current + 1) % audios.length; update(); };
			label.hide();
		}
	}

	// ── Tooltip ───────────────────────────────────────────────────────────────

	private showTooltip(anchor: HTMLElement, text: string): void {
		this.tooltipEl.setText(text);
		this.tooltipEl.show();
		const rect = anchor.getBoundingClientRect();
		const tipRect = this.tooltipEl.getBoundingClientRect();
		let left = rect.left + rect.width / 2 - tipRect.width / 2;
		let top = rect.top - tipRect.height - 8;
		if (top < 4) top = rect.bottom + 8;
		left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
		this.tooltipEl.style.left = `${left}px`;
		this.tooltipEl.style.top = `${top}px`;
	}

	private hideTooltip(): void {
		this.tooltipEl.hide();
	}

	// ── Keyboard ──────────────────────────────────────────────────────────────

	private onKeyDown = (e: KeyboardEvent): void => {
		if (e.key === "PageDown") {
			e.preventDefault();
			void this.changeMonth(1);
			return;
		}
		if (e.key === "PageUp") {
			e.preventDefault();
			void this.changeMonth(-1);
			return;
		}
		if (e.key === "Enter" && this.selectedKey) {
			e.preventDefault();
			void this.openSelectedDay();
			return;
		}
		const arrows: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -7],
			ArrowDown: [0, 7],
		};
		const move = arrows[e.key];
		if (move) {
			e.preventDefault();
			this.moveSelection(move[0] + move[1]);
		}
	};

	private moveSelection(delta: number): void {
		const cells = buildCalendarGrid(this.currentYear, this.currentMonth, this.options.weekStart);
		const curIdx = this.selectedKey
			? cells.findIndex((c) => c.key === this.selectedKey)
			: cells.findIndex((c) => c.inCurrentMonth);
		const nextIdx = Math.max(0, Math.min(41, (curIdx < 0 ? 0 : curIdx) + delta));
		this.selectedKey = cells[nextIdx].key;
		this.gridEl.querySelectorAll(".is-selected").forEach((el) => el.removeClass("is-selected"));
		const card = this.gridEl.querySelector(`[data-date="${this.selectedKey}"]`);
		card?.addClass("is-selected");
		(card as HTMLElement)?.focus();
	}

	private async openSelectedDay(): Promise<void> {
		if (!this.selectedKey) return;
		const { year, month, day } = parseDateKey(this.selectedKey);
		const data = await this.fetchMonth(year, month);
		const dayData = this.buildDayMap(data).get(this.selectedKey);
		if (dayData) this.options.onOpenDay?.(dayData);
	}

	// ── Resizer ───────────────────────────────────────────────────────────────

	private initResizer(resizer: HTMLElement): void {
		resizer.addEventListener("mousedown", (e) => {
			e.preventDefault();
			const startX = e.clientX;
			const startY = e.clientY;
			const startW = this.modalEl.offsetWidth;
			const startH = this.modalEl.offsetHeight;
			const onMove = (me: MouseEvent) => {
				this.modalEl.style.width = `${startW + (me.clientX - startX)}px`;
				this.modalEl.style.height = `${startH + (me.clientY - startY)}px`;
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		});
	}
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function openCalendarGallery(options: CalendarGalleryOptions): CalendarGalleryModal {
	const modal = new CalendarGalleryModal(this.app, options);
	modal.open();
	return modal;
}
