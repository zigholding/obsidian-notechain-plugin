export function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

export function errorStack(err: unknown): string | undefined {
	return err instanceof Error ? err.stack : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

type Ctor = { prototype: object };

/** Copy mixin methods onto a class prototype (no `any`). */
export function applyMixins(derivedCtor: Ctor, constructors: Ctor[]): void {
	constructors.forEach((baseCtor) => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
			if (name === 'constructor') return;
			const desc = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
			if (desc) Object.defineProperty(derivedCtor.prototype, name, desc);
		});
	});
}
