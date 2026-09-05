export type HttpHeaderValue = string | string[] | undefined;
export type HttpHeaders = Record<string, HttpHeaderValue>;

/** Duck-typed Node IncomingMessage (avoid Node module type imports). */
export interface HttpReq {
	method?: string;
	url?: string;
	headers: HttpHeaders;
	socket?: { destroy?: () => void };
	on(event: 'data', listener: (chunk: Buffer | string) => void): this;
	on(event: 'end', listener: () => void): this;
	on(event: 'error', listener: (error: Error) => void): this;
	on(event: 'close', listener: () => void): this;
	on(event: string, listener: (...args: unknown[]) => void): this;
}

/** Duck-typed Node ServerResponse (avoid Node module type imports). */
export interface HttpRes {
	statusCode?: number;
	headersSent?: boolean;
	writableEnded?: boolean;
	socket?: { destroy?: () => void };
	flush?: () => void;
	setHeader(name: string, value: string | number | readonly string[]): void;
	writeHead(statusCode: number, headers?: Record<string, string | number | readonly string[]>): this;
	write(chunk: string | Uint8Array, encoding?: BufferEncoding, cb?: (err?: Error | null) => void): boolean;
	end(chunk?: string | Uint8Array, encoding?: BufferEncoding, cb?: () => void): this;
	on(event: string, listener: (...args: unknown[]) => void): this;
	once(event: string, listener: (...args: unknown[]) => void): this;
	emit(event: string, ...args: unknown[]): boolean;
	removeListener(event: string, listener: (...args: unknown[]) => void): this;
}

export type ParsedQuery = Record<string, string | string[] | undefined>;

export type ParsedReqUrl = {
	pathname: string | null;
	query: ParsedQuery;
};

/** Parse a request path with query, using WHATWG URL (mobile-safe). */
export function parseRequestUrl(raw: string): ParsedReqUrl {
	try {
		const u = new URL(raw || '/', 'http://127.0.0.1');
		const query: ParsedQuery = {};
		u.searchParams.forEach((value, key) => {
			const prev = query[key];
			if (prev === undefined) {
				query[key] = value;
			} else if (Array.isArray(prev)) {
				prev.push(value);
			} else {
				query[key] = [prev, value];
			}
		});
		return { pathname: u.pathname, query };
	} catch {
		const qIndex = raw.indexOf('?');
		return {
			pathname: qIndex >= 0 ? raw.slice(0, qIndex) : raw || '/',
			query: {},
		};
	}
}

export type SseConnection = {
	res: HttpRes;
	sessionId: string;
	connectedAt: Date;
	heartbeatInterval: number | null;
};

export function parseJsonRecord(body: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(body);
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}
