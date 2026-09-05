import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';

export type HttpReq = IncomingMessage;
export type HttpRes = ServerResponse & { flush?: () => void };
export type ParsedReqUrl = UrlWithParsedQuery;

export type SseConnection = {
	res: HttpRes;
	sessionId: string;
	connectedAt: Date;
	heartbeatInterval: ReturnType<typeof setInterval> | null;
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
