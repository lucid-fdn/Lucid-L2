import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

export type SchemaId = 'Policy' | 'ModelMeta' | 'ComputeMeta' | 'RunReceipt';

/** Validation result type - discriminated union */
export type ValidationResult<T> = 
  | { ok: true; value: T; errors?: never }
  | { ok: false; errors: any; value?: never };

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

export function validateWithSchema<T>(id: SchemaId, value: unknown): ValidationResult<T> {
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

