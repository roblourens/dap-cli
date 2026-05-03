import { promises as fs } from 'node:fs';
import path from 'node:path';

const schemaUrl = 'https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json';
const outputPath = path.join(process.cwd(), 'src', 'generated', 'dapCommandRegistry.ts');

type JsonRecord = Record<string, unknown>;
type RequestDirection = 'clientToAdapter' | 'adapterToClient';
type GeneratedArgumentType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string' | 'unknown';

interface GeneratedCommand {
  readonly command: string;
  readonly cliName: string;
  readonly requestType: string;
  readonly direction: RequestDirection;
  readonly argumentsType?: string;
  readonly capability?: string;
  readonly validation: GeneratedValidation;
}

interface GeneratedValidation {
  readonly argsRequired: boolean;
  readonly requiredProperties: readonly string[];
  readonly propertyTypes: readonly GeneratedProperty[];
}

interface GeneratedProperty {
  readonly name: string;
  readonly type: GeneratedArgumentType;
  readonly required: boolean;
}

export async function main(): Promise<void> {
  const schema = await fetchSchema();
  const commands = extractCommands(schema);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderRegistry(commands), 'utf8');
}

export function extractCommands(schema: unknown): readonly GeneratedCommand[] {
  const definitions = getRecord(getRecord(schema).definitions);
  let direction: RequestDirection = 'clientToAdapter';
  const commands: GeneratedCommand[] = [];

  for (const [definitionName, definition] of Object.entries(definitions)) {
    if (!definitionName.endsWith('Request')) {
      continue;
    }

    const requestDefinition = getRecord(definition);
    const requestBody = getRequestObject(requestDefinition);
    const title = getOptionalString(requestBody.title);
    if (title === 'Reverse Requests') {
      direction = 'adapterToClient';
    } else if (title === 'Requests') {
      direction = 'clientToAdapter';
    }

    const properties = getRecord(requestBody.properties);
    const commandProperty = getRecord(properties.command);
    const command = getFirstString(commandProperty.enum);
    if (command === undefined) {
      continue;
    }

    const argumentsType = getArgumentsType(properties.arguments);
    const validation = getValidation(definitions, requestBody, argumentsType);
    const capability = getCapability(requestBody);

    const generatedCommand: Omit<GeneratedCommand, 'cliName'> = {
      command,
      requestType: definitionName,
      direction,
      validation,
    };
    if (argumentsType !== undefined) {
      commands.push(createGeneratedCommand({ ...generatedCommand, argumentsType, ...(capability === undefined ? {} : { capability }) }));
      continue;
    }

    commands.push(createGeneratedCommand({ ...generatedCommand, ...(capability === undefined ? {} : { capability }) }));
  }

  return commands.sort((left, right) => left.command.localeCompare(right.command));
}

async function fetchSchema(): Promise<unknown> {
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch DAP schema: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function createGeneratedCommand(command: Omit<GeneratedCommand, 'cliName'>): GeneratedCommand {
  return {
    ...command,
    cliName: toKebabCase(command.command),
  };
}

function getRequestObject(definition: JsonRecord): JsonRecord {
  const allOf = getArray(definition.allOf);
  const objectDefinition = allOf
    .map(value => getOptionalRecord(value))
    .find(value => value !== undefined && getOptionalRecord(value.properties) !== undefined);

  if (objectDefinition === undefined) {
    throw new Error('Request definition is missing object body.');
  }

  return objectDefinition;
}

function getArgumentsType(argumentsProperty: unknown): string | undefined {
  const property = getOptionalRecord(argumentsProperty);
  if (property === undefined) {
    return undefined;
  }

  const ref = getOptionalString(property.$ref);
  if (ref === undefined) {
    return undefined;
  }

  return ref.replace('#/definitions/', '');
}

function getValidation(definitions: JsonRecord, requestBody: JsonRecord, argumentsType: string | undefined): GeneratedValidation {
  const requiredRequestProperties = getStringArray(requestBody.required);
  const argsRequired = requiredRequestProperties.includes('arguments');
  if (argumentsType === undefined) {
    return { argsRequired, requiredProperties: [], propertyTypes: [] };
  }

  const argumentsDefinition = getOptionalRecord(definitions[argumentsType]);
  if (argumentsDefinition === undefined) {
    return { argsRequired, requiredProperties: [], propertyTypes: [] };
  }

  const requiredProperties = getStringArray(argumentsDefinition.required).sort((left, right) => left.localeCompare(right));
  const properties = getOptionalRecord(argumentsDefinition.properties) ?? {};
  const propertyTypes = Object.entries(properties)
    .map(([name, property]) => ({
      name,
      type: getPropertyType(property),
      required: requiredProperties.includes(name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { argsRequired, requiredProperties, propertyTypes };
}

function getCapability(requestBody: JsonRecord): string | undefined {
  const description = getOptionalString(requestBody.description);
  if (description === undefined) {
    return undefined;
  }

  const requestGateMatch = /Clients should only call this request if(?: one or more)?(?: the)?(?: corresponding)? capability `([^`]+)`(?: returns one or more filters| is true)/.exec(description);
  if (requestGateMatch?.[1] !== undefined) {
    return requestGateMatch[1];
  }

  if (description.includes('Clients should only call this request if') && description.includes('`exceptionBreakpointFilters`')) {
    return 'exceptionBreakpointFilters';
  }

  return undefined;
}

function getPropertyType(property: unknown): GeneratedArgumentType {
  const propertyRecord = getOptionalRecord(property);
  if (propertyRecord === undefined) {
    return 'unknown';
  }

  if (typeof propertyRecord.$ref === 'string') {
    return 'object';
  }

  const directType = propertyRecord.type;
  if (typeof directType === 'string') {
    return normalizeType(directType);
  }
  if (Array.isArray(directType)) {
    const directTypes: unknown[] = directType;
    const nonNullType = directTypes.find(value => value !== 'null');
    return typeof nonNullType === 'string' ? normalizeType(nonNullType) : 'unknown';
  }

  return 'unknown';
}

function normalizeType(value: string): GeneratedArgumentType {
  if (value === 'array' || value === 'boolean' || value === 'integer' || value === 'number' || value === 'object' || value === 'string') {
    return value;
  }

  return 'unknown';
}

function renderRegistry(commands: readonly GeneratedCommand[]): string {
  return `// This file is generated by src/generator/dapCommandRegistryGenerator.ts. Do not edit by hand.\n${renderRegistryTypes()}\nexport const dapGeneratedCommands = ${renderCommands(commands)} as const satisfies readonly DapGeneratedCommandMetadata[];\n\nexport type DapGeneratedCommandRegistry = typeof dapGeneratedCommands;\n\nexport function getDapGeneratedCommand(command: string): DapGeneratedCommandMetadata | undefined {\n  return dapGeneratedCommands.find(entry => entry.command === command);\n}\n`;
}

function renderRegistryTypes(): string {
  return `import type { DebugProtocol } from '@vscode/debugprotocol';\n\nexport type DapRequestDirection = 'clientToAdapter' | 'adapterToClient';\nexport type DapGeneratedArgumentType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string' | 'unknown';\n\nexport interface DapGeneratedArgumentProperty {\n  readonly name: string;\n  readonly type: DapGeneratedArgumentType;\n  readonly required: boolean;\n}\n\nexport interface DapGeneratedArgumentValidation {\n  readonly argsRequired: boolean;\n  readonly requiredProperties: readonly string[];\n  readonly propertyTypes: readonly DapGeneratedArgumentProperty[];\n}\n\nexport interface DapGeneratedCommandMetadata {\n  readonly command: string;\n  readonly cliName: string;\n  readonly requestType: string;\n  readonly direction: DapRequestDirection;\n  readonly argumentsType?: string;\n  readonly capability?: keyof DebugProtocol.Capabilities;\n  readonly validation: DapGeneratedArgumentValidation;\n}\n`;
}

function renderCommands(commands: readonly GeneratedCommand[]): string {
  return `[\n${commands.map(command => `  ${renderCommand(command)},`).join('\n')}\n]`;
}

function renderCommand(command: GeneratedCommand): string {
  const fields = [
    `command: ${JSON.stringify(command.command)}`,
    `cliName: ${JSON.stringify(command.cliName)}`,
    `requestType: ${JSON.stringify(command.requestType)}`,
    `direction: ${JSON.stringify(command.direction)}`,
  ];
  if (command.argumentsType !== undefined) {
    fields.push(`argumentsType: ${JSON.stringify(command.argumentsType)}`);
  }
  if (command.capability !== undefined) {
    fields.push(`capability: ${JSON.stringify(command.capability)}`);
  }
  fields.push(`validation: ${renderValidation(command.validation)}`);

  return `{ ${fields.join(', ')} }`;
}

function renderValidation(validation: GeneratedValidation): string {
  return `{ argsRequired: ${String(validation.argsRequired)}, requiredProperties: ${JSON.stringify(validation.requiredProperties)}, propertyTypes: ${renderProperties(validation.propertyTypes)} }`;
}

function renderProperties(properties: readonly GeneratedProperty[]): string {
  return `[${properties.map(property => `{ name: ${JSON.stringify(property.name)}, type: ${JSON.stringify(property.type)}, required: ${String(property.required)} }`).join(', ')}]`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function getRecord(value: unknown): JsonRecord {
  const record = getOptionalRecord(value);
  if (record === undefined) {
    throw new Error('Expected object.');
  }

  return record;
}

function getOptionalRecord(value: unknown): JsonRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonRecord;
}

function getArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected array.');
  }

  return value;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getFirstString(value: unknown): string | undefined {
  const array: unknown[] = Array.isArray(value) ? value : [];
  const first = array[0];
  return typeof first === 'string' ? first : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}