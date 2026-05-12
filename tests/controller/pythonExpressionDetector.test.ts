import { describe, expect, test } from 'vitest';
import { looksLikePythonStatement, wrapForExec } from '../../src/controller/pythonExpressionDetector.js';

describe('looksLikePythonStatement — statement positives', () => {
  test.each([
    ['import os', 'leading import keyword'],
    ['from x import y', 'from-import'],
    ['def f(): pass', 'def keyword'],
    ['class C: pass', 'class keyword'],
    ['x = 1', 'top-level assignment'],
    ['if x:\n  y = 2', 'if statement (newline)'],
    ['import x; y = 1', 'semicolon-separated statements'],
    ['try:\n  pass\nexcept:\n  pass', 'multi-line try/except'],
    ['del x', 'del keyword'],
    ['for i in range(3): print(i)', 'for keyword'],
    ['while True: pass', 'while keyword'],
    ['with open("f") as f: pass', 'with keyword'],
    ['return x', 'return keyword'],
    ['raise ValueError("x")', 'raise keyword'],
    ['pass', 'pass keyword (bare)'],
    ['break', 'break keyword'],
    ['continue', 'continue keyword'],
    ['global g', 'global keyword'],
    ['nonlocal n', 'nonlocal keyword'],
    ['assert x == 1', 'assert keyword'],
    ['yield 1', 'yield keyword'],
    ['async def f(): pass', 'async keyword'],
    ['await coro()', 'await keyword (treated as statement)'],
    ['  import os  ', 'leading whitespace tolerated'],
    ['x = f(y=1)', 'assignment with kwargs inside RHS'],
    ['a, b = 1, 2', 'tuple unpacking assignment'],
    ['x += 1', 'augmented assignment'],
    ['elif x: pass', 'elif keyword'],
    ['else: pass', 'else keyword'],
    ['except: pass', 'except keyword'],
    ['finally: pass', 'finally keyword'],
    ['if True:\n\timport os', 'tab-indented body with newline'],
  ])('detects statement: %s (%s)', (source) => {
    expect(looksLikePythonStatement(source)).toBe(true);
  });
});

describe('looksLikePythonStatement — expression negatives', () => {
  test.each([
    ['1 + 1', 'arithmetic'],
    ['f(x=1, y=2)', 'kwargs in call'],
    ['[i for i in range(3)]', 'list comprehension'],
    ['{k: v for k, v in items}', 'dict comprehension'],
    ['lambda x: x + 1', 'lambda expression'],
    ['(x := 5)', 'walrus operator'],
    ['a if b else c', 'ternary expression'],
    ['obj.attr.method(arg)', 'attribute + call'],
    ['dict[key]', 'subscript'],
    ['"a" == "b"', 'equality (== not =)'],
    ['x != y', 'inequality'],
    ['x <= y', '<='],
    ['x >= y', '>='],
    ['not x', 'not operator'],
    ['x and y or z', 'boolean operators'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['"x = 1"', 'string literal containing assignment'],
    ["'x = 1; y = 2'", 'single-quoted string with semicolon'],
    ['"a\\nb"', 'string literal with escaped newline'],
    ['f(g(x), h(y))', 'nested calls'],
    ['{1, 2, 3}', 'set literal'],
    ['{"k": "v"}', 'dict literal'],
    ['some_fn(a=b, c=d)', 'kwargs (= inside parens)'],
    ['arr[i] + arr[j]', 'subscripts in expression'],
    ['len("hello")', 'simple call'],
    ['# just a comment', 'bare comment line (no real code)'],
  ])('detects expression: %s (%s)', (source) => {
    expect(looksLikePythonStatement(source)).toBe(false);
  });
});

describe('wrapForExec', () => {
  test('produces an exec(...) form whose inner literal round-trips via JSON.parse', () => {
    const sources = [
      'import os',
      'x = 1; y = 2',
      'if x:\n  y = 2',
      'print("hello \\"world\\"")',
      'a\\nb',
      "x = 'single'",
    ];
    for (const src of sources) {
      const wrapped = wrapForExec(src);
      // Shape: exec("...") — single argument JSON-encoded string.
      const match = wrapped.match(/^exec\((.*)\)$/s);
      expect(match, `wrapped form should be exec(...) for ${JSON.stringify(src)}`).not.toBeNull();
      const inner = match![1]!;
      // Inner literal must be a valid JSON string that decodes to the original source.
      expect(JSON.parse(inner)).toBe(src);
    }
  });

  test('wrapForExec output is itself a pure expression (so detector returns false on it)', () => {
    expect(looksLikePythonStatement(wrapForExec('import os'))).toBe(false);
  });
});
