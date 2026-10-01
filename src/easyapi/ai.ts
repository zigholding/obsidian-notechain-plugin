import { App, requestUrl } from 'obsidian';
import type { EasyAPI } from './easyapi';
import { errorMessage, isRecord } from '../ts-helpers';

/**
 * Templater:
 * ```js
 * tR = await ea.ai.request({ question: '你好', model: '模型笔记' })
 * ```
 * 完整 JSON 在 `ea.ai.data`。
 */

export interface AiModelConfig {
	baseUrl?: string;
	apiKey?: string;
	name?: string;
	systemPrompt?: string;
}

export interface AiChatMessage {
	role: string;
	content: string;
}

export class Ai {
	app: App;
	ea: EasyAPI;
	/** 最近一次成功的 chat/completions JSON。 */
	data: unknown = null;

	constructor(app: App, ea: EasyAPI) {
		this.app = app;
		this.ea = ea;
	}

	/**
	 * 调用 OpenAI 兼容接口。
	 * `options`：`question`、`action`（`chat` | `list_models`）、
	 * `model`（配置对象，或笔记路径/链接，读该笔记 frontmatter `model`）、
	 * `messages`、`history` / `chatHistory` / `previousMessages`、`temperature`、`maxTokens`、`body`、`metadata`。
	 * 返回助手文本或模型 id 列表；失败时返回以 ❌ 开头的说明。
	 */
	async request(options: unknown = {}): Promise<string> {
		const opts = isRecord(options) ? options : {};
		this.data = null;

		const model = opts.model != null ? this.resolveModel(opts.model) : {};
		const baseUrl = model.baseUrl?.replace(/\/$/, '') ?? '';
		if (!baseUrl) {
			return '❌ 缺少 model.baseUrl';
		}
		const systemPrompt = model.systemPrompt || undefined;
		const question = typeof opts.question === 'string' ? opts.question : undefined;
		const action = typeof opts.action === 'string' ? opts.action : 'chat';

		try {
			if (action === 'list_models') {
				const modelsResp = await this.apiFetch(baseUrl, model.apiKey, '/models');
				if (!isOk(modelsResp.status)) {
					return `❌ 获取模型失败 (${modelsResp.status}): ${modelsResp.text}`;
				}
				return formatModelIds(parseJson(modelsResp.text));
			}

			const messages = buildMessages(opts, systemPrompt, question);
			const requestBody: Record<string, unknown> = {
				messages,
				temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
				max_tokens: typeof opts.maxTokens === 'number' ? opts.maxTokens : 2000,
				stream: false,
			};
			if (model.name) {
				requestBody.model = model.name;
			}
			if (isRecord(opts.body)) {
				Object.assign(requestBody, opts.body);
			}
			if (opts.metadata) {
				requestBody.metadata = opts.metadata;
			}

			const response = await this.apiFetch(baseUrl, model.apiKey, '/chat/completions', {
				method: 'POST',
				body: JSON.stringify(requestBody),
			});

			if (isOk(response.status)) {
				const data = parseJson(response.text);
				this.data = data;
				return chatText(data);
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
			return `❌ API 请求失败 (${response.status}): ${errorDetail}`;
		} catch (error) {
			return `❌ 请求异常: ${errorMessage(error)}`;
		}
	}

	private resolveModel(model: unknown): AiModelConfig {
		if (typeof model === 'string') {
			const file = this.ea.file.get_tfile(model);
			if (!file) return {};
			return asModelConfig(this.ea.editor.get_frontmatter(file, 'model', {}));
		}
		return asModelConfig(model);
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

function asModelConfig(value: unknown): AiModelConfig {
	if (!isRecord(value)) return {};
	const config: AiModelConfig = {};
	if (typeof value.baseUrl === 'string') config.baseUrl = value.baseUrl;
	if (typeof value.apiKey === 'string') config.apiKey = value.apiKey;
	if (typeof value.name === 'string') config.name = value.name;
	if (typeof value.systemPrompt === 'string') config.systemPrompt = value.systemPrompt;
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
