// Node module hook used by scripts/setup-adapters.ts to map `.js` relative
// imports to their `.ts` siblings inside src/. Required because Node 22's
// --experimental-strip-types resolves imports literally and does not perform
// .js -> .ts fallback. Production users invoke the built bundle from dist/.

export async function resolve(specifier, context, nextResolve) {
	if (
		(specifier.startsWith('./') || specifier.startsWith('../')) &&
		specifier.endsWith('.js')
	) {
		try {
			return await nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		} catch {
			// Fall through to default resolution if no .ts sibling exists.
		}
	}
	return nextResolve(specifier, context);
}
