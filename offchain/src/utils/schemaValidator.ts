import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export type SchemaId = 'Policy' | 'ModelMeta' | 'ComputeMeta' | 'RunReceipt';

const SCHEMA_FILES: Record<SchemaId, string> = {
  Policy: 'Policy.schema.json',
  ModelMeta: 'ModelMeta.schema.json',
  ComputeMeta: 'ComputeMeta.schema.json',
  RunReceipt: 'RunReceipt.schema.json',
};

let ajvSingleton: Ajv | null = null;
const validatorCache = new Map<SchemaId, any>();

function getAjv(): Ajv {
  if (!ajvSingleton) {
    // AJV v8: easiest way to fully support draft-2020-12 is to use the dedicated class.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv2020 = require('ajv/dist/2020').default;
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
    });
    addFormats(ajv);
    ajvSingleton = ajv;
  }
  return ajvSingleton as Ajv;
}

function schemaBaseDir(): string {
  // offchain/src/utils -> offchain -> Lucid-L2-main -> schemas
  return path.resolve(__dirname, '../../../schemas');
}

export function loadSchema(id: SchemaId): object {
  const schemaPath = path.join(schemaBaseDir(), SCHEMA_FILES[id]);
  const raw = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(raw);
}

export function validateWithSchema<T>(id: SchemaId, value: unknown): { ok: true; value: T } | { ok: false; errors: any } {
  const ajv = getAjv();
  let validate = validatorCache.get(id);
  if (!validate) {
    const schema = loadSchema(id);
    validate = ajv.compile(schema);
    validatorCache.set(id, validate);
  }
  const ok = validate(value);
  if (!ok) {
    return { ok: false, errors: validate.errors };
  }
  return { ok: true, value: value as T };
}

