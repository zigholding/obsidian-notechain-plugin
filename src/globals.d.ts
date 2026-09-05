import type { EasyAPI } from './easyapi/easyapi';
import type NoteChainPlugin from './plugin';

export {};

declare global {
	interface Window {
		ea?: EasyAPI;
		nc?: NoteChainPlugin;
		/** Electron / desktop Node require (not on mobile). */
		require?: NodeRequire;
		cJS?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
	}
}
