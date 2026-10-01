import { App, TFile, requestUrl } from 'obsidian';
import type { EasyAPI } from './easyapi';
import { errorMessage, isRecord } from '../ts-helpers';

/**
 * Templater:
 * ```js
 * tR = await ea.ai.request({ question: '你好', config_tfile: '模型笔记' })
 * ```
 * 成功时请求体和响应在 `ea.ai.last_reqeust`。
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
	last_reqeust: unknown = null;

	constructor(app: App, ea: EasyAPI) {
		this.app = app;
		this.ea = ea;
	}

	/**
	 * 调用 OpenAI 兼容接口。
	 * `options`：`baseUrl`、`apiKey`、`name`、`systemPrompt`、`question`、`action`（`chat` | `list_models`）、
	 * `config_tfile`（`TFile` 或笔记路径；缺省字段读该笔记 frontmatter `model`）、
	 * `messages`、`history` / `chatHistory` / `previousMessages`、`temperature`、`maxTokens`、`body`、`metadata`。
	 * `options` 里的 `baseUrl` / `apiKey` / `name` / `systemPrompt` 优先于 `config_tfile`。
	 * 返回助手文本或模型 id 列表；失败时返回以 ❌ 开头的说明。
	 */
	async request(options: unknown = {}): Promise<string> {
		const opts = isRecord(options) ? options : {};
		this.last_reqeust = null;

		const fileConfig = this.readConfigFile(opts.config_tfile);
		const baseUrl = (textOpt(opts.baseUrl) || fileConfig.baseUrl || '').replace(/\/$/, '');
		if (!baseUrl) {
			return '❌ 缺少 baseUrl';
		}
		const apiKey = textOpt(opts.apiKey) || fileConfig.apiKey;
		const modelName = textOpt(opts.name) || fileConfig.name;
		const systemPrompt = textOpt(opts.systemPrompt) || fileConfig.systemPrompt;
		const question = typeof opts.question === 'string' ? opts.question : undefined;
		const action = typeof opts.action === 'string' ? opts.action : 'chat';

		try {
			if (action === 'list_models') {
				const modelsResp = await this.apiFetch(baseUrl, apiKey, '/models');
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
			if (isRecord(opts.body)) {
				Object.assign(requestBody, opts.body);
			}
			if (opts.metadata) {
				requestBody.metadata = opts.metadata;
			}
			if (modelName) {
				requestBody.model = modelName;
			}

			const response = await this.apiFetch(baseUrl, apiKey, '/chat/completions', {
				method: 'POST',
				body: JSON.stringify(requestBody),
			});

			if (isOk(response.status)) {
				const data = parseJson(response.text);
				this.last_reqeust = [requestBody,data];
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

	private readConfigFile(file: unknown): AiModelConfig {
		if (!(file instanceof TFile) && typeof file !== 'string') return {};
		return asModelConfig(this.ea.editor.get_frontmatter(file, 'model', {}));
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
