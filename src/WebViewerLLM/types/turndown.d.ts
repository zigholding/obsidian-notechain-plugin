declare module 'turndown' {
	export interface TurndownServiceOptions {
		headingStyle?: string;
		bulletListMarker?: string;
		codeBlockStyle?: string;
		emDelimiter?: string;
		strongDelimiter?: string;
		[key: string]: unknown;
	}

	export type TurndownRuleFilter =
		| string
		| string[]
		| ((node: Element, options?: TurndownServiceOptions) => boolean);

	export interface TurndownRule {
		filter?: TurndownRuleFilter;
		replacement?: (content: string, node: Element, options?: TurndownServiceOptions) => string;
	}

	export default class TurndownService {
		constructor(options?: TurndownServiceOptions);
		use(plugin: (service: TurndownService) => void): TurndownService;
		addRule(name: string, rule: TurndownRule): void;
		turndown(html: string): string;
	}
}
