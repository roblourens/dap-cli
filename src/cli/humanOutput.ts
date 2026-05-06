import { inspect } from 'node:util';
import type { CliError } from './errors.js';
import type { JsonMetaInput } from './output.js';
import { createMeta, toJsonErrorPayload } from './output.js';

const inspectOptions = {
  colors: false,
  depth: 6,
  breakLength: 100,
  compact: false,
  sorted: true,
} as const;

export function renderHumanSuccess<T>(data: T, meta: JsonMetaInput): string {
  const renderedMeta = createMeta(meta);
  const curated = renderCuratedSuccess(data, renderedMeta.command);
  if (curated !== undefined) {
    return renderBlock(curated.title, curated.lines);
  }

  return [
    'Data:',
    sanitizeForTerminal(inspect(data, inspectOptions)),
    '',
  ].join('\n');
}

export function renderHumanFailure(error: CliError, _meta: JsonMetaInput): string {
  const payload = toJsonErrorPayload(error);
  const lines = [
    `${styleLabel('Error')}: ${styleValue(sanitizeForTerminal(payload.message), 'error')}`,
    `Code: ${sanitizeForTerminal(payload.code)}`,
    `Category: ${sanitizeForTerminal(payload.category)}`,
    `Exit code: ${payload.exitCode}`,
  ];

  if (payload.diagnostics.length > 0) {
    lines.push('Diagnostics:');
    for (const diagnostic of payload.diagnostics) {
      lines.push(`- ${sanitizeForTerminal(diagnostic)}`);
    }
  }
  if (payload.sessionId !== undefined) {
    lines.push(`Session: ${sanitizeForTerminal(payload.sessionId)}`);
  }
  if (payload.request !== undefined) {
    const seq = payload.request.seq === undefined ? '' : ` (seq ${payload.request.seq})`;
    lines.push(`Request: ${sanitizeForTerminal(payload.request.command)}${seq}`);
  }
  if (payload.adapter !== undefined) {
    lines.push('Adapter:');
    if (payload.adapter.descriptorId !== undefined) {
      lines.push(`- Descriptor: ${sanitizeForTerminal(payload.adapter.descriptorId)}`);
    }
    if (payload.adapter.pid !== undefined) {
      lines.push(`- PID: ${payload.adapter.pid}`);
    }
    if (payload.adapter.stderrTail !== undefined && payload.adapter.stderrTail.length > 0) {
      lines.push('- Stderr tail:');
      for (const stderrLine of payload.adapter.stderrTail) {
        lines.push(`  - ${sanitizeForTerminal(stderrLine)}`);
      }
    }
    if (payload.adapter.logPath !== undefined) {
      lines.push(`- Log: ${sanitizeForTerminal(payload.adapter.logPath)}`);
    }
  }
  if (payload.data !== undefined) {
    lines.push('Data:');
    lines.push(sanitizeForTerminal(inspect(payload.data, inspectOptions)));
  }

  lines.push('');
  return lines.join('\n');
}

export function sanitizeForTerminal(value: string): string {
  let sanitized = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 13) {
      sanitized += '\n';
    } else if ((code < 32 && code !== 9 && code !== 10) || (code >= 127 && code <= 159)) {
      sanitized += '?';
    } else {
      sanitized += character;
    }
  }

  return sanitized;
}

interface CuratedOutput {
  title: string;
  lines: string[];
}

type UnknownRecord = Record<string, unknown>;
type StyleKind = 'plain' | 'boolean' | 'status' | 'numberValue' | 'stringValue' | 'booleanValue' | 'functionValue' | 'objectValue' | 'event' | 'error';

interface TableCell {
  text: string;
  style?: StyleKind;
}

type TableRow = Array<string | TableCell>;

interface TableColumn {
  header: string;
  style?: StyleKind;
}

function renderCuratedSuccess(data: unknown, command: string): CuratedOutput | undefined {
  switch (command) {
    case 'sessions':
      return renderSessions(data);
    case 'status':
      return renderStatus(data);
    case 'events':
      return renderEvents(data);
    case 'breakpoints set':
      return renderBreakpoints(data);
    case 'threads':
      return renderThreads(data);
    case 'stack':
      return renderStack(data);
    case 'scopes':
      return renderScopes(data);
    case 'variables':
      return renderVariables(data);
    case 'evaluate':
      return renderEvaluate(data);
    case 'cleanup':
      return renderRecordSection('Cleanup:', data);
    case 'close':
      return renderRecordSection('Close:', data);
    case 'launch configs':
      return renderLaunchConfigs(data);
    default:
      return undefined;
  }
}

function renderLaunchConfigs(data: unknown): CuratedOutput | undefined {
  if (!isRecordArray(data)) {
    return undefined;
  }

  return {
    title: 'Launch Configs:',
    lines: formatTable([
      { header: 'Kind' },
      { header: 'Name' },
      { header: 'Type' },
      { header: 'Request' },
      { header: 'Members' },
      { header: 'Stop all', style: 'boolean' },
    ], data.map(entry => [
      fieldText(entry, 'kind'),
      fieldText(entry, 'name'),
      fieldText(entry, 'type'),
      fieldText(entry, 'request'),
      fieldText(entry, 'configurations'),
      booleanText(entry.stopAll),
    ])),
  };
}

function renderSessions(data: unknown): CuratedOutput | undefined {
  if (!isRecordArray(data)) {
    return undefined;
  }

  const includeActive = data.some(session => 'active' in session);
  const includeChild = data.some(session => 'parent_session_id' in session || 'parentSessionId' in session || session.targetable === false);
  const includeCompound = data.some(session => isRecord(session.compound));
  const headers: TableColumn[] = [
    { header: 'ID' },
    { header: 'Name' },
    { header: 'Status', style: 'status' },
    { header: 'Adapter' },
  ];
  if (includeCompound) {
    headers.push({ header: 'Compound' });
  }
  if (includeActive) {
    headers.push({ header: 'Active', style: 'boolean' });
  }
  if (includeChild) {
    headers.push({ header: 'Child', style: 'boolean' });
  }

  const rows = data.map(session => {
    const row = [fieldText(session, 'id'), fieldText(session, 'name'), fieldText(session, 'status') || fieldText(session, 'lifecycle'), fieldText(session, 'adapter') || 'unknown'];
    if (includeCompound) {
      row.push(compoundSummaryText(session.compound));
    }
    if (includeActive) {
      row.push(booleanText(session.active));
    }
    if (includeChild) {
      row.push(session.parent_session_id !== undefined || session.parentSessionId !== undefined || session.targetable === false ? 'yes' : 'no');
    }
    return row;
  });

  return { title: 'Sessions:', lines: formatTable(headers, rows) };
}

function renderStatus(data: unknown): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const fields: Array<[string, string]> = [];
  pushField(fields, 'ID', data, 'id');
  pushField(fields, 'Name', data, 'name');
  pushField(fields, 'Status', data, 'status');
  pushField(fields, 'Paused', data, 'paused');
  pushField(fields, 'Stopped reason', data, 'stoppedReason');
  pushArrayField(fields, 'Stopped thread IDs', data, 'stoppedThreadIds');
  pushField(fields, 'PID', data, 'pid');
  pushField(fields, 'Endpoint', data, 'endpoint');
  pushField(fields, 'State directory', data, 'stateDir');
  pushField(fields, 'Log directory', data, 'logDir');
  pushField(fields, 'Build ID', data, 'buildId');
  if (isRecord(data.compound)) {
    pushField(fields, 'Compound', data.compound, 'name');
    pushField(fields, 'Compound member', data.compound, 'memberName');
    fields.push(['Compound stop all', booleanText(data.compound.stopAll)]);
    pushArrayField(fields, 'Compound members', data.compound, 'members');
  }
  if (fields.length === 0) {
    return undefined;
  }

  return { title: 'Status:', lines: fields.map(([label, value]) => `${label}: ${value}`) };
}

function compoundSummaryText(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }
  const name = fieldText(value, 'name');
  const member = fieldText(value, 'memberName');
  if (name.length === 0) {
    return member;
  }
  if (member.length === 0) {
    return name;
  }
  return `${name}/${member}`;
}

function renderEvents(data: unknown): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const lines: string[] = [];
  const warnings = arrayField(data, 'warnings').filter((warning): warning is string => typeof warning === 'string');
  if (warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of warnings) {
      lines.push(`- ${safe(warning)}`);
    }
  }

  const sessionName = fieldText(data, 'name');
  const sessionId = fieldText(data, 'sessionId');
  if (sessionName.length > 0 || sessionId.length > 0) {
    lines.push(`Session: ${sessionName.length > 0 ? sessionName : sessionId}${sessionName.length > 0 && sessionId.length > 0 ? ` (${sessionId})` : ''}`);
  }
  pushFieldLine(lines, 'Cursor', data, 'cursor');
  pushFieldLine(lines, 'Dropped', data, 'dropped');
  pushFieldLine(lines, 'Capacity', data, 'capacity');
  if (isRecord(data.capacityByPriority)) {
    lines.push(`Capacity by priority: high ${fieldText(data.capacityByPriority, 'high')}, low ${fieldText(data.capacityByPriority, 'low')}`);
  }

  const events = arrayField(data, 'events').filter(isRecord);
  if (events.length > 0) {
    lines.push('Events:');
    lines.push(...formatTable([{ header: 'Event', style: 'event' }, { header: 'Details' }], events.map(event => [fieldText(event, 'event'), inspectOmitting(event, ['event'])])));
  }

  return { title: 'Events:', lines };
}

function renderBreakpoints(data: unknown): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const breakpoints = arrayField(data, 'breakpoints').filter(isRecord);
  if (breakpoints.length === 0) {
    return undefined;
  }

  return {
    title: 'Breakpoints:',
    lines: formatTable([{ header: 'Line' }, { header: 'Verified', style: 'boolean' }, { header: 'Message' }], breakpoints.map(breakpoint => [
      fieldText(breakpoint, 'line'),
      booleanText(breakpoint.verified),
      fieldText(breakpoint, 'message'),
    ])),
  };
}

function renderThreads(data: unknown): CuratedOutput | undefined {
  return renderArrayTable('Threads:', data, 'threads', [{ header: 'ID' }, { header: 'Name' }], thread => [fieldText(thread, 'id'), fieldText(thread, 'name')]);
}

function renderStack(data: unknown): CuratedOutput | undefined {
  return renderArrayTable('Stack:', data, 'stackFrames', [{ header: 'ID' }, { header: 'Name' }, { header: 'Line' }, { header: 'Source' }], frame => [
    fieldText(frame, 'id'),
    fieldText(frame, 'name'),
    fieldText(frame, 'line'),
    sourceText(frame.source),
  ]);
}

function renderScopes(data: unknown): CuratedOutput | undefined {
  return renderArrayTable('Scopes:', data, 'scopes', [{ header: 'Name' }, { header: 'Variables reference' }, { header: 'Expensive', style: 'boolean' }], scope => [
    fieldText(scope, 'name'),
    fieldText(scope, 'variablesReference'),
    booleanText(scope.expensive),
  ]);
}

function renderVariables(data: unknown): CuratedOutput | undefined {
  return renderArrayTable('Variables:', data, 'variables', [{ header: 'Name' }, { header: 'Value' }, { header: 'Type' }, { header: 'Variables reference' }], variable => [
    fieldText(variable, 'name'),
    { text: fieldText(variable, 'value'), style: variableValueStyle(fieldText(variable, 'type')) },
    fieldText(variable, 'type'),
    fieldText(variable, 'variablesReference'),
  ]);
}

function renderEvaluate(data: unknown): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const lines: string[] = [];
  pushFieldLine(lines, 'Result', data, 'result');
  pushFieldLine(lines, 'Type', data, 'type');
  pushFieldLine(lines, 'Variables reference', data, 'variablesReference');
  if (lines.length === 0) {
    lines.push(formatUnknown(data));
  }

  return { title: 'Evaluate:', lines };
}

function renderRecordSection(title: string, data: unknown): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const lines = Object.entries(data).map(([key, value]) => `${styleLabel(labelFromKey(key))}: ${formatValue(value)}`);
  return { title, lines };
}

function renderArrayTable(
  title: string,
  data: unknown,
  field: string,
  headers: TableColumn[],
  toRow: (record: UnknownRecord) => TableRow,
): CuratedOutput | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const items = arrayField(data, field).filter(isRecord);
  if (items.length === 0) {
    return undefined;
  }

  return { title, lines: formatTable(headers, items.map(toRow)) };
}

function renderBlock(title: string, lines: string[]): string {
  return [
    styleTitle(title),
    ...lines,
    '',
  ].join('\n');
}

function formatTable(headers: TableColumn[], rows: TableRow[]): string[] {
  const safeHeaders = headers.map(column => safe(column.header));
  const safeRows = rows.map(row => headers.map((header, index): TableCell => {
    const cell = row[index];
    if (typeof cell === 'object' && cell !== null) {
      return { text: safe(cell.text), style: cell.style ?? header.style ?? 'plain' };
    }
    return { text: safe(cell ?? ''), style: header.style ?? 'plain' };
  }));
  const widths = safeHeaders.map((header, index) => Math.max(header.length, ...safeRows.map(row => row[index]?.text.length ?? 0)));

  const top = `┌${widths.map(width => '─'.repeat(width + 2)).join('┬')}┐`;
  const headerSeparator = `├${widths.map(width => '─'.repeat(width + 2)).join('┼')}┤`;
  const bottom = `└${widths.map(width => '─'.repeat(width + 2)).join('┴')}┘`;

  const headerLine = formatTableLine(safeHeaders, widths, headers.map(() => 'plain'), true);
  const rowLines = safeRows.map(row => formatTableLine(row, widths, headers.map(column => column.style ?? 'plain'), false));

  return [top, headerLine, headerSeparator, ...rowLines, bottom];
}

function formatTableLine(cells: Array<string | TableCell>, widths: number[], styles: StyleKind[], header: boolean): string {
  const renderedCells = cells.map((cell, index) => {
    const text = typeof cell === 'string' ? cell : cell.text;
    const style = typeof cell === 'string' ? styles[index] : cell.style ?? styles[index];
    const padded = text.padEnd(widths[index] ?? text.length, ' ');
    const styled = header ? styleHeader(padded) : styleValue(padded, style ?? 'plain');
    return ` ${styled} `;
  });

  return `│${renderedCells.join('│')}│`;
}

function pushField(fields: Array<[string, string]>, label: string, record: UnknownRecord, key: string): void {
  const value = fieldText(record, key);
  if (value.length > 0) {
    fields.push([label, value]);
  }
}

function pushArrayField(fields: Array<[string, string]>, label: string, record: UnknownRecord, key: string): void {
  const values = arrayField(record, key).map(formatValue);
  if (values.length > 0) {
    fields.push([label, values.join(', ')]);
  }
}

function pushFieldLine(lines: string[], label: string, record: UnknownRecord, key: string): void {
  const value = fieldText(record, key);
  if (value.length > 0) {
    lines.push(`${styleLabel(label)}: ${value}`);
  }
}

function fieldText(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (value === undefined || value === null) {
    return '';
  }

  return formatValue(value);
}

function arrayField(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function sourceText(value: unknown): string {
  if (!isRecord(value)) {
    return formatValue(value);
  }

  return fieldText(value, 'path') || fieldText(value, 'name') || formatUnknown(value);
}

function booleanText(value: unknown): string {
  if (typeof value !== 'boolean') {
    return '';
  }

  return value ? 'yes' : 'no';
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return safe(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (value === undefined || value === null) {
    return '';
  }

  return formatUnknown(value);
}

function inspectOmitting(record: UnknownRecord, omittedKeys: readonly string[]): string {
  const rest: UnknownRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (!omittedKeys.includes(key)) {
      rest[key] = value;
    }
  }

  return Object.keys(rest).length === 0
    ? ''
    : Object.entries(rest).map(([key, value]) => `${labelFromKey(key)}: ${formatValue(value)}`).join(', ');
}

function formatUnknown(value: unknown): string {
  return safe(inspect(value, inspectOptions));
}

function labelFromKey(key: string): string {
  return safe(key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, first => first.toUpperCase()));
}

function safe(value: string): string {
  return sanitizeForTerminal(value);
}

function styleTitle(value: string): string {
  return colorize(safe(value), 'bold');
}

function styleHeader(value: string): string {
  return colorize(value, 'bold');
}

function styleLabel(value: string): string {
  return colorize(safe(value), 'bold');
}

function styleValue(value: string, style: StyleKind): string {
  switch (style) {
    case 'boolean':
      return colorize(value, value.trim() === 'yes' || value.trim() === 'true' ? 'green' : 'yellow');
    case 'status':
      return colorizeStatus(value);
    case 'numberValue':
      return colorize(value, 'cyan');
    case 'stringValue':
      return colorize(value, 'green');
    case 'booleanValue':
      return colorize(value, 'yellow');
    case 'functionValue':
      return colorize(value, 'blue');
    case 'objectValue':
      return colorize(value, 'magenta');
    case 'event':
      return colorizeEvent(value);
    case 'error':
      return colorize(value, 'red');
    case 'plain':
      return value;
  }
}

function colorizeStatus(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'running' || normalized === 'continued' || normalized === 'initialized') {
    return colorize(value, 'green');
  }
  if (normalized === 'stopped' || normalized === 'paused' || normalized === 'breakpoint') {
    return colorize(value, 'yellow');
  }
  if (normalized === 'terminated' || normalized === 'exited' || normalized === 'closed') {
    return colorize(value, 'dim');
  }
  return value;
}

function colorizeEvent(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'stopped' || normalized === 'breakpoint') {
    return colorize(value, 'yellow');
  }
  if (normalized === 'terminated' || normalized === 'exited') {
    return colorize(value, 'dim');
  }
  if (normalized === 'continued' || normalized === 'initialized') {
    return colorize(value, 'green');
  }
  return value;
}

function variableValueStyle(typeText: string): StyleKind {
  switch (typeText.trim().toLowerCase()) {
    case 'number':
    case 'bigint':
      return 'numberValue';
    case 'string':
      return 'stringValue';
    case 'boolean':
      return 'booleanValue';
    case 'function':
      return 'functionValue';
    case 'object':
    case 'array':
      return 'objectValue';
    default:
      return 'plain';
  }
}

type AnsiStyle = 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan';

const ansiStyles: Record<AnsiStyle, string> = {
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  magenta: '\u001B[35m',
  cyan: '\u001B[36m',
};

function colorize(value: string, style: AnsiStyle): string {
  if (!shouldUseColor()) {
    return value;
  }

  return `${ansiStyles[style]}${value}\u001B[0m`;
}

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb') {
    return false;
  }
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined && forceColor !== '' && forceColor !== '0') {
    return true;
  }

  return process.stdout.isTTY === true;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value) && value.every(isRecord);
}