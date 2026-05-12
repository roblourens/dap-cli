/**
 * Heuristic Python statement-vs-expression classifier for the controller's
 * `evaluate` rewrite path on debugpy sessions. Pure module — no I/O, no
 * project imports, fully unit-testable.
 *
 * `looksLikePythonStatement(source)` returns true when `source` looks like
 * one or more Python statements (which debugpy's expression-only `evaluate`
 * would reject as SyntaxError). False for pure expressions.
 *
 * `wrapForExec(source)` returns `exec("...")` with the source JSON-encoded
 * inside the string literal — Python string-literal escaping is a strict
 * superset of JSON's for newline / quote / backslash / control chars, so
 * `JSON.stringify` produces a valid Python string literal.
 */

const STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
	'import', 'from', 'def', 'class',
	'if', 'elif', 'else', 'for', 'while',
	'with', 'try', 'except', 'finally',
	'raise', 'return', 'pass', 'break', 'continue',
	'global', 'nonlocal', 'del', 'assert', 'yield',
	'async', 'await',
]);

export function looksLikePythonStatement(source: string): boolean {
	const trimmed = source.trim();
	if (trimmed.length === 0) {
		return false;
	}
	// A bare comment line has no executable code; treat as non-statement so
	// the rewrite path leaves it alone (debugpy will surface its own error).
	if (trimmed.startsWith('#')) {
		return false;
	}

	// Leading-keyword check: first identifier-shaped token followed by a
	// statement-introducing delimiter.
	const keywordMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
	if (keywordMatch !== null) {
		const word = keywordMatch[1]!;
		if (STATEMENT_KEYWORDS.has(word)) {
			const after = trimmed.charAt(word.length);
			if (after === '' || after === ' ' || after === '\t' || after === '\n' || after === '(' || after === ':') {
				return true;
			}
		}
	}

	// Linear scan tracking bracket depth and string-literal state.
	let bracketDepth = 0;
	type StringMode = 'none' | "'" | '"' | "'''" | '"""';
	let mode: StringMode = 'none';

	for (let i = 0; i < source.length; i++) {
		const c = source.charAt(i);

		if (mode === 'none') {
			if (c === '#') {
				// Skip to end of line. A newline IS a statement separator,
				// so if we hit one we're already a multi-statement input.
				while (i < source.length && source.charAt(i) !== '\n') {
					i++;
				}
				if (i < source.length && source.charAt(i) === '\n') {
					return true;
				}
				continue;
			}
			if (c === '"' || c === "'") {
				if (source.slice(i, i + 3) === c + c + c) {
					mode = (c + c + c) as StringMode;
					i += 2;
				} else {
					mode = c;
				}
				continue;
			}
			if (c === '(' || c === '[' || c === '{') {
				bracketDepth++;
				continue;
			}
			if (c === ')' || c === ']' || c === '}') {
				bracketDepth = Math.max(0, bracketDepth - 1);
				continue;
			}
			if (c === '\n') {
				return true;
			}
			if (c === ';') {
				return true;
			}
			if (c === '=' && bracketDepth === 0) {
				const prev = i > 0 ? source.charAt(i - 1) : '';
				const next = i + 1 < source.length ? source.charAt(i + 1) : '';
				if (next === '=') {
					i++; // skip past '=='
					continue;
				}
				if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || prev === ':') {
					continue; // part of ==, !=, <=, >=, :=
				}
				return true;
			}
			continue;
		}

		// Inside a string literal.
		if (c === '\\') {
			i++; // skip the escaped character
			continue;
		}
		if (mode === "'" || mode === '"') {
			if (c === mode) {
				mode = 'none';
			}
			continue;
		}
		// Triple-quoted.
		if (source.slice(i, i + 3) === mode) {
			i += 2;
			mode = 'none';
		}
	}

	return false;
}

export function wrapForExec(source: string): string {
	return `exec(${JSON.stringify(source)})`;
}
