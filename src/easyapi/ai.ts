import { App, TFile, requestUrl } from 'obsidian';
import type { EasyAPI } from './easyapi';
import { errorMessage, isRecord } from '../ts-helpers';

/**
 * Templater:
 * ```js
 * const rsp = await ea.ai.request({ question: '你好', config_tfile: '模型笔记' })
 * tR = rsp.text
 * ```
 * 同一次结果也在 `ea.ai.last_reqeust`。
 */

/** 不写入请求 JSON 的选项。`header` 只作 HTTP 头。 */
const REQUEST_SKIP = new Set(['header', 'config_tfile']);

interface AiSourceConfig {
	baseUrl?: string;
	apiKey?: string;
	name?: string;
	systemPrompt?: string;
	header?: Record<string, string>;
	/** `model` 里除 `header` 外的字段，原样进入请求 JSON。 */
	fields: Record<string, unknown>;
}

export interface AiChatMessage {
	role: string;
	content: string;
}

export interface AiRequestResult {
	headers: Record<string, string>;
	request: Record<string, unknown> | null;
	response: unknown;
	text: string;
}

export class Ai {
	app: App;
	ea: EasyAPI;
	/** 最近一次调用的返回值。 */
	last_reqeust: AiRequestResult | null = null;

	constructor(app: App, ea: EasyAPI) {
		this.app = app;
		this.ea = ea;
	}

	/**
	 * 调用 OpenAI 兼容接口。
	 * `options` 与配置笔记 frontmatter `model` 里，除 `header`、`config_tfile` 外的字段都写入请求 JSON。
	 * 同名字段 `options` 优先。
	 * `header` 只作为 HTTP 头。`config_tfile` 为 `TFile` 或笔记路径。
	 * `name` 在请求还没有 `model` 时填到 `model`。`action` 为 `chat`（默认）或 `list_models`。
	 * 返回 `{ headers, request, response, text }`。`text` 为助手文本或模型 id；失败时 `text` 以 ❌ 开头。
	 */
	async request(options: unknown = {}): Promise<AiRequestResult> {
		const opts = isRecord(options) ? options : {};
		this.last_reqeust = null;

		const fileConfig = this.readConfigFile(opts.config_tfile);
		const baseUrl = (textOpt(opts.baseUrl) || fileConfig.baseUrl || '').replace(/\/$/, '');
		if (!baseUrl) {
			return this.finish({
				headers: {},
				request: null,
				response: null,
				text: '❌ 缺少 baseUrl',
			});
		}
		const apiKey = textOpt(opts.apiKey) || fileConfig.apiKey;
		const modelName = textOpt(opts.name) || fileConfig.name;
		const systemPrompt = textOpt(opts.systemPrompt) || fileConfig.systemPrompt;
		const question = typeof opts.question === 'string' ? opts.question : undefined;
		const action = typeof opts.action === 'string' ? opts.action : 'chat';
		const headers = {
			...(fileConfig.header ?? {}),
			...(asHeaderMap(opts.header) ?? {}),
		};

		let requestBody: Record<string, unknown> | null = null;
		try {
			if (action === 'list_models') {
				const modelsResp = await this.apiFetch(baseUrl, apiKey, '/models', { headers });
				const data = parseJson(modelsResp.text);
				if (!isOk(modelsResp.status)) {
					return this.finish({
						headers,
						request: null,
						response: data,
						text: `❌ 获取模型失败 (${modelsResp.status}): ${modelsResp.text}`,
					});
				}
				return this.finish({
					headers,
					request: null,
					response: data,
					text: formatModelIds(data),
				});
			}

			const messages = buildMessages(opts, systemPrompt, question);
			requestBody = {
				...fileConfig.fields,
				...requestFields(opts),
				messages,
			};
			if (modelName && requestBody.model == null) {
				requestBody.model = modelName;
			}

			const response = await this.apiFetch(baseUrl, apiKey, '/chat/completions', {
				headers,
				method: 'POST',
				body: JSON.stringify(requestBody),
			});

			if (isOk(response.status)) {
				const data = parseJson(response.text);
				return this.finish({
					headers,
					request: requestBody,
					response: data,
					text: chatText(data),
				});
			}

			const errorText = response.text;
			let errorDetail = errorText;
			const errorJson = tryParseJson(errorText);
			if (isRecord(errorJson)) {
				const nested = errorJson.error;
				if (isRecord(nested) && nested.message != null) {
					errorDetail = String(nested.message);
				} else if (errorJson.message != null) {
					errorDetail = String(errorJson.message);
				}
			}
			return this.finish({
				headers,
				request: requestBody,
				response: errorJson,
				text: `❌ API 请求失败 (${response.status}): ${errorDetail}`,
			});
		} catch (error) {
			return this.finish({
				headers,
				request: requestBody,
				response: null,
				text: `❌ 请求异常: ${errorMessage(error)}`,
			});
		}
	}

	private finish(result: AiRequestResult): AiRequestResult {
		this.last_reqeust = result;
		return result;
	}

	private readConfigFile(file: unknown): AiSourceConfig {
		if (!(file instanceof TFile) && typeof file !== 'string') return { fields: {} };
		return readModelObject(this.ea.editor.get_frontmatter(file, 'model', {}));
	}

	private apiFetch(
		baseUrl: string,
		apiKey: string | undefined,
		path: string,
		options: { method?: string; body?: string; headers?: Record<string, string> } = {},
	) {
		const headers: Record<string, string> = {
			...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers ?? {}),
		};
		return requestUrl({
			url: `${baseUrl}${path}`,
			method: options.method,
			headers,
			body: options.body,
			throw: false,
		});
	}
}

function textOpt(value: unknown): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function requestFields(record: Record<string, unknown>): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (REQUEST_SKIP.has(key)) continue;
		fields[key] = value;
	}
	return fields;
}

function asHeaderMap(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const headers: Record<string, string> = {};
	for (const [key, val] of Object.entries(value)) {
		if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
			headers[key] = String(val);
		}
	}
	return headers;
}

function readModelObject(value: unknown): AiSourceConfig {
	if (!isRecord(value)) return { fields: {} };
	const config: AiSourceConfig = { fields: requestFields(value) };
	if (typeof value.baseUrl === 'string') config.baseUrl = value.baseUrl;
	if (typeof value.apiKey === 'string') config.apiKey = value.apiKey;
	if (typeof value.name === 'string') config.name = value.name;
	if (typeof value.systemPrompt === 'string') config.systemPrompt = value.systemPrompt;
	const header = asHeaderMap(value.header);
	if (header) config.header = header;
	return config;
}

function normalizeHistory(raw: unknown): AiChatMessage[] {
	if (!Array.isArray(raw)) return [];
	const out: AiChatMessage[] = [];
	for (const item of raw) {
		if (!item) continue;
		if (typeof item === 'string') {
			const i = out.length;
			out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: item });
			continue;
		}
		if (isRecord(item) && item.content != null) {
			const role = typeof item.role === 'string' && item.role ? item.role : 'user';
			if (role === 'system') continue;
			out.push({ role, content: String(item.content) });
		}
	}
	return out;
}

function buildMessages(
	opts: Record<string, unknown>,
	systemPrompt: string | undefined,
	question: string | undefined,
): AiChatMessage[] {
	const system = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
	if (Array.isArray(opts.messages) && opts.messages.length > 0) {
		const msgs = opts.messages
			.filter((m): m is Record<string, unknown> => isRecord(m) && m.content != null)
			.map((m) => ({
				role: typeof m.role === 'string' && m.role ? m.role : 'user',
				content: String(m.content),
			}));
		const hasSystem = msgs.some((m) => m.role === 'system');
		return hasSystem ? msgs : [...system, ...msgs];
	}

	const history = normalizeHistory(
		opts.history ?? opts.chatHistory ?? opts.previousMessages,
	);
	const user = question != null ? [{ role: 'user', content: question }] : [];
	return [...system, ...history, ...user];
}

function formatModelIds(data: unknown): string {
	if (!isRecord(data) || !Array.isArray(data.data)) {
		return JSON.stringify(data, null, 2);
	}
	const ids = data.data
		.filter(isRecord)
		.map((m) => m.id)
		.filter((id): id is string => typeof id === 'string');
	return ids.length ? ids.join('\n') : JSON.stringify(data, null, 2);
}

function chatText(data: unknown): string {
	if (!isRecord(data)) return JSON.stringify(data);
	const choices = data.choices;
	if (Array.isArray(choices) && isRecord(choices[0])) {
		const message = choices[0].message;
		if (isRecord(message) && message.content != null) {
			return String(message.content);
		}
	}
	if (data.response != null) return String(data.response);
	if (data.content != null) return String(data.content);
	return JSON.stringify(data);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

function isOk(status: number): boolean {
	return status >= 200 && status < 300;
}
