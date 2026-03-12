# LucidLayer OpenAPI Implementation Tracker

**Document Version**: 1.0  
**Created**: 2026-01-12  
**Last Updated**: 2026-01-12  
**Status**: In Progress

---

## Executive Summary

This document tracks the implementation progress for making the LucidLayer API fully OpenAPI 3.1 compatible. This includes creating an OpenAPI specification, adding interactive documentation (Swagger UI), implementing validation middleware, setting up Speakeasy SDK generation, and integrating with CI/CD.

### Current OpenAPI Coverage: **0%**

### Key Goals:
1. **OpenAPI 3.1 Specification** - Document all 42+ API endpoints
2. **Swagger UI** - Interactive API documentation
3. **Request/Response Validation** - Replace AJV with OpenAPI validator
4. **Speakeasy SDK Generation** - Auto-generate TypeScript and Python SDKs
5. **API Versioning** - Implement URL-based versioning strategy
6. **Security Documentation** - Document API key and Bearer token auth

### Timeline: **10-12 days** (with parallelization)

---

## What's Already Implemented ✅

| Component | Status | Notes |
|-----------|--------|-------|
| REST API Endpoints | ✅ Complete | 42+ endpoints across 2 route files |
| JSON Schemas | ✅ Complete | ModelMeta, ComputeMeta, Policy, RunReceipt |
| AJV Validation | ✅ Complete | Will be replaced with OpenAPI validation |
| TypeScript SDK | ✅ Complete | Manual implementation |
| Python SDK | ✅ Complete | Manual implementation |

---

## New Dependencies Required

```json
{
  "dependencies": {
    "swagger-ui-express": "^5.0.0",
    "yamljs": "^0.3.0",
    "express-openapi-validator": "^5.1.0"
  },
  "devDependencies": {
    "@apidevtools/swagger-parser": "^10.1.0",
    "@stoplight/spectral-cli": "^6.11.0",
    "@types/swagger-ui-express": "^4.1.6",
    "@types/yamljs": "^0.2.34"
  }
}
```

**Speakeasy CLI** (global install):
```bash
npm install -g speakeasy-api/speakeasy
# Or via curl
curl -fsSL https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh | sh
```

---

## Phase 1: OpenAPI 3.1 Specification

**Priority**: 🔴 CRITICAL  
**Estimated Effort**: 2-3 days  
**Dependencies**: None  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 1.1 Core Specification Structure
**File**: `Lucid-L2-main/offchain/openapi.yaml`

- [ ] Create OpenAPI 3.1 metadata structure
  ```yaml
  openapi: 3.1.0
  info:
    title: LucidLayer API
    version: 1.0.0
    description: ...
  ```
- [ ] Define server URLs (dev, staging, prod)
- [ ] Create tags for endpoint grouping
- [ ] Set up reusable components structure

### 1.2 Security Schemes
**Section**: `components.securitySchemes`

- [ ] Define API Key authentication (`X-API-Key` header)
- [ ] Define Bearer token authentication
- [ ] Define OAuth2 flows (if applicable)
- [ ] Document which endpoints require auth

### 1.3 Schema Components (from JSON Schemas)
**Section**: `components.schemas`

- [ ] Convert `ModelMeta.schema.json` → OpenAPI component
- [ ] Convert `ComputeMeta.schema.json` → OpenAPI component  
- [ ] Convert `Policy.schema.json` → OpenAPI component
- [ ] Convert `RunReceipt.schema.json` → OpenAPI component
- [ ] Create `Passport` schema (common fields)
- [ ] Create `PaginatedResponse` schema
- [ ] Create `ErrorResponse` schema
- [ ] Create `SuccessResponse` schema

### 1.4 Passport Endpoints (15 endpoints)
**Tag**: `Passports`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/passports` | createPassport | [ ] |
| GET | `/v1/passports/:passport_id` | getPassport | [ ] |
| PATCH | `/v1/passports/:passport_id` | updatePassport | [ ] |
| DELETE | `/v1/passports/:passport_id` | deletePassport | [ ] |
| GET | `/v1/passports` | listPassports | [ ] |
| GET | `/v1/models` | searchModels | [ ] |
| GET | `/v1/compute` | searchCompute | [ ] |
| GET | `/v1/tools` | listTools | [ ] |
| GET | `/v1/datasets` | listDatasets | [ ] |
| GET | `/v1/agents` | listAgents | [ ] |
| POST | `/v1/passports/:passport_id/sync` | syncPassportToChain | [ ] |
| GET | `/v1/passports/pending-sync` | getPendingSync | [ ] |
| GET | `/v1/passports/stats` | getPassportStats | [ ] |

### 1.5 Execution & Inference Endpoints (2 endpoints)
**Tag**: `Inference`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/run/inference` | runInference | [ ] |
| POST | `/v1/chat/completions` | chatCompletions | [ ] |

**Special Notes:**
- [ ] Document SSE streaming response format
- [ ] Add `x-streaming: true` extension
- [ ] Include OpenAI-compatible request/response schemas

### 1.6 Matching & Routing Endpoints (3 endpoints)
**Tag**: `Matching`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/match` | matchComputeForModel | [ ] |
| POST | `/v1/match/explain` | explainMatch | [ ] |
| POST | `/v1/route` | getExecutionRoute | [ ] |

### 1.7 Receipt Endpoints (4 endpoints)
**Tag**: `Receipts`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/receipts` | createReceipt | [ ] |
| GET | `/v1/receipts/:receipt_id` | getReceipt | [ ] |
| GET | `/v1/receipts/:receipt_id/verify` | verifyReceipt | [ ] |
| GET | `/v1/receipts/:receipt_id/proof` | getReceiptProof | [ ] |

### 1.8 Epoch & Anchoring Endpoints (12 endpoints)
**Tag**: `Epochs`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| GET | `/v1/epochs/current` | getCurrentEpoch | [ ] |
| GET | `/v1/epochs/:epoch_id` | getEpoch | [ ] |
| GET | `/v1/epochs` | listEpochs | [ ] |
| GET | `/v1/epochs/stats` | getEpochStats | [ ] |
| GET | `/v1/epochs/ready` | getReadyEpochs | [ ] |
| POST | `/v1/epochs` | createEpoch | [ ] |
| POST | `/v1/epochs/:epoch_id/retry` | retryEpoch | [ ] |
| POST | `/v1/receipts/commit-root` | commitEpochRoot | [ ] |
| POST | `/v1/receipts/commit-roots-batch` | commitEpochRootsBatch | [ ] |
| GET | `/v1/epochs/:epoch_id/verify` | verifyEpochAnchor | [ ] |
| GET | `/v1/epochs/:epoch_id/transaction` | getEpochTransaction | [ ] |
| GET | `/v1/anchoring/health` | getAnchoringHealth | [ ] |

### 1.9 Compute Registry Endpoints (2 endpoints)
**Tag**: `Compute`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/compute/nodes/heartbeat` | sendHeartbeat | [ ] |
| GET | `/v1/compute/nodes/:compute_passport_id/health` | getComputeHealth | [ ] |

### 1.10 Payout Endpoints (4 endpoints)
**Tag**: `Payouts`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| POST | `/v1/payouts/calculate` | calculatePayout | [ ] |
| POST | `/v1/payouts/from-receipt` | createPayoutFromReceipt | [ ] |
| GET | `/v1/payouts/:run_id` | getPayout | [ ] |
| GET | `/v1/payouts/:run_id/verify` | verifyPayout | [ ] |

### 1.11 Utility Endpoints (2 endpoints)
**Tag**: `Utilities`

| Method | Path | OperationId | Status |
|--------|------|-------------|--------|
| GET | `/v1/signer/pubkey` | getSignerPublicKey | [ ] |
| GET | `/v1/mmr/root` | getMmrRoot | [ ] |

### Phase 1 Completion Checklist
- [ ] All 42 endpoints documented
- [ ] All request schemas defined
- [ ] All response schemas defined
- [ ] All error responses documented
- [ ] Security requirements specified
- [ ] Examples added for key endpoints
- [ ] OpenAPI spec validates against 3.1 standard

**Phase 1 Status**: ⏳ Not Started

---

## Phase 2: Swagger UI Integration

**Priority**: 🔴 HIGH  
**Estimated Effort**: 1 day  
**Dependencies**: Phase 1 (partial - can start with basic spec)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 2.1 Install Dependencies
**File**: `Lucid-L2-main/offchain/package.json`

- [ ] Install `swagger-ui-express`
- [ ] Install `yamljs`
- [ ] Add TypeScript types

### 2.2 Integrate Swagger UI
**File**: `Lucid-L2-main/offchain/src/index.ts`

- [ ] Import swagger-ui-express and yamljs
- [ ] Load OpenAPI spec from YAML file
- [ ] Mount Swagger UI at `/api-docs`
- [ ] Configure custom options (title, theme)

**Implementation:**
```typescript
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const openApiSpec = YAML.load(path.join(__dirname, '../openapi.yaml'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'LucidLayer API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    tryItOutEnabled: true,
  }
}));
```

### 2.3 Configure Features
- [ ] Enable "Try it out" for all endpoints
- [ ] Configure persistent authorization
- [ ] Add request/response examples
- [ ] Enable deep linking

### 2.4 Add JSON Endpoint
- [ ] Serve OpenAPI spec at `/api-docs/openapi.json`
- [ ] Serve OpenAPI spec at `/api-docs/openapi.yaml`

### 2.5 CORS Configuration
- [ ] Enable CORS for API documentation
- [ ] Configure allowed origins for "Try it out"

### Phase 2 Completion Checklist
- [ ] Swagger UI accessible at `/api-docs`
- [ ] "Try it out" working for all endpoints
- [ ] Authorization persisted across requests
- [ ] Custom branding applied
- [ ] OpenAPI spec downloadable

**Phase 2 Status**: ⏳ Not Started

---

## Phase 3: OpenAPI Validation Middleware

**Priority**: 🔴 HIGH  
**Estimated Effort**: 2-3 days  
**Dependencies**: Phase 1 (complete spec)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 3.1 Install and Configure Validator
**File**: `Lucid-L2-main/offchain/package.json`

- [ ] Install `express-openapi-validator`
- [ ] Configure in Express app

**Implementation:**
```typescript
import * as OpenApiValidator from 'express-openapi-validator';

app.use(
  OpenApiValidator.middleware({
    apiSpec: './openapi.yaml',
    validateRequests: true,
    validateResponses: process.env.NODE_ENV !== 'production',
    validateSecurity: {
      handlers: {
        ApiKeyAuth: (req, scopes, schema) => {
          // API key validation logic
          return req.headers['x-api-key'] === process.env.API_KEY;
        },
        BearerAuth: (req, scopes, schema) => {
          // Bearer token validation logic
          const token = req.headers.authorization?.replace('Bearer ', '');
          return validateBearerToken(token);
        }
      }
    }
  })
);
```

### 3.2 Error Handling
**File**: `Lucid-L2-main/offchain/src/middleware/errorHandler.ts`

- [ ] Create OpenAPI-compliant error handler
- [ ] Format validation errors properly
- [ ] Include error details in response
- [ ] Log validation failures

**Implementation:**
```typescript
import { HttpError } from 'express-openapi-validator/dist/framework/types';

export function openApiErrorHandler(
  err: Error | HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: {
        message: err.message,
        type: 'validation_error',
        code: 'VALIDATION_ERROR',
        errors: err.errors,
      },
    });
  }
  next(err);
}
```

### 3.3 Migrate from AJV
**Files**: Various route files

- [ ] Remove AJV validation from `passportRoutes.ts`
- [ ] Remove AJV validation from `lucidLayerRoutes.ts`
- [ ] Update `schemaValidator.ts` to use OpenAPI schemas (or deprecate)
- [ ] Remove direct AJV imports from routes
- [ ] Test all endpoints still validate correctly

### 3.4 Response Validation (Development Mode)
- [ ] Enable response validation in development
- [ ] Log response validation errors
- [ ] Disable in production for performance

### 3.5 Testing
**File**: `Lucid-L2-main/offchain/src/__tests__/openApiValidation.test.ts`

- [ ] Test request validation (missing fields)
- [ ] Test request validation (wrong types)
- [ ] Test request validation (extra fields)
- [ ] Test response validation
- [ ] Test security validation (missing API key)
- [ ] Test security validation (invalid token)

### Phase 3 Completion Checklist
- [ ] OpenAPI validator configured
- [ ] Error handler implemented
- [ ] AJV validation removed from routes
- [ ] All tests passing
- [ ] Response validation working (dev mode)

**Phase 3 Status**: ⏳ Not Started

---

## Phase 4: Schema Synchronization

**Priority**: 🟡 MEDIUM  
**Estimated Effort**: 2 days  
**Dependencies**: Phase 1 (basic spec)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 4.1 Schema Conversion Utility
**File**: `Lucid-L2-main/offchain/src/utils/schemaConverter.ts`

- [ ] Create JSON Schema v7 → OpenAPI 3.1 converter
- [ ] Handle `$ref` references
- [ ] Handle format conversions
- [ ] Handle nullable types
- [ ] Handle anyOf/oneOf/allOf

**Implementation:**
```typescript
export function jsonSchemaToOpenApi(jsonSchema: any): any {
  // Convert JSON Schema v7 to OpenAPI 3.1
  const converted = { ...jsonSchema };
  
  // Remove JSON Schema specific keywords
  delete converted.$schema;
  delete converted.$id;
  
  // Convert type + null to nullable
  if (Array.isArray(converted.type)) {
    if (converted.type.includes('null')) {
      converted.type = converted.type.find(t => t !== 'null');
      converted.nullable = true;
    }
  }
  
  // Recursively convert nested schemas
  // ...
  
  return converted;
}
```

### 4.2 Build Script
**File**: `Lucid-L2-main/offchain/scripts/generate-openapi-schemas.ts`

- [ ] Read JSON schemas from `/schemas` directory
- [ ] Convert to OpenAPI format
- [ ] Write to `openapi.yaml` components section
- [ ] Add script to `package.json`

### 4.3 Validation Consistency
- [ ] Create golden tests for schema conversion
- [ ] Ensure both validators produce same results
- [ ] Document any differences

### Phase 4 Completion Checklist
- [ ] Schema converter implemented
- [ ] Build script working
- [ ] Schemas auto-generated from JSON schemas
- [ ] Golden tests passing
- [ ] Documentation updated

**Phase 4 Status**: ⏳ Not Started

---

## Phase 5: Speakeasy SDK Generation

**Priority**: 🟡 MEDIUM  
**Estimated Effort**: 3-4 days  
**Dependencies**: Phase 1 (complete and validated spec)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 5.1 Speakeasy Configuration
**File**: `Lucid-L2-main/.speakeasy/gen.yaml`

- [ ] Create Speakeasy configuration file
- [ ] Configure TypeScript SDK settings
- [ ] Configure Python SDK settings
- [ ] Set up naming conventions

**Configuration:**
```yaml
configVersion: 2.0.0
generation:
  sdkClassName: LucidLayer
  maintainOpenAPIOrder: true
  usageSnippets:
    optionalPropertyRendering: withExample
  fixes:
    nameResolutionDec2023: true
    parameterOrderingFeb2024: true
    requestResponseComponentNamesFeb2024: true
typescript:
  version: 1.0.0
  packageName: "@lucidlayer/sdk"
  author: LucidLayer
  description: LucidLayer SDK for TypeScript
  clientServerStatusCodesAsErrors: true
  flattenGlobalSecurity: true
  maxMethodParams: 4
python:
  version: 1.0.0
  packageName: lucidlayer
  author: LucidLayer
  description: LucidLayer SDK for Python
  flattenGlobalSecurity: true
```

### 5.2 Generate TypeScript SDK
**Directory**: `Lucid-L2-main/packages/sdk-js-generated/`

- [ ] Run Speakeasy generation
  ```bash
  speakeasy generate sdk \
    --schema openapi.yaml \
    --lang typescript \
    --out packages/sdk-js-generated
  ```
- [ ] Review generated code
- [ ] Test basic functionality
- [ ] Compare with existing SDK

### 5.3 Generate Python SDK
**Directory**: `Lucid-L2-main/packages/sdk-py-generated/`

- [ ] Run Speakeasy generation
  ```bash
  speakeasy generate sdk \
    --schema openapi.yaml \
    --lang python \
    --out packages/sdk-py-generated
  ```
- [ ] Review generated code
- [ ] Test basic functionality
- [ ] Compare with existing SDK

### 5.4 SDK Customization
- [ ] Add custom logic wrappers (streaming support)
- [ ] Add authentication helpers
- [ ] Add retry logic
- [ ] Add logging options

### 5.5 SDK Testing
**Files**: Various test files

- [ ] Test TypeScript SDK against live API
- [ ] Test Python SDK against live API
- [ ] Run existing example scripts with new SDK
- [ ] Compare behavior with manual SDKs

### 5.6 Migration Path
**File**: `Lucid-L2-main/docs/SDK_MIGRATION_GUIDE.md`

- [ ] Document breaking changes (if any)
- [ ] Provide migration examples
- [ ] Create deprecation warnings for old SDK
- [ ] Plan transition timeline

### Phase 5 Completion Checklist
- [ ] Speakeasy configuration complete
- [ ] TypeScript SDK generated
- [ ] Python SDK generated
- [ ] SDKs tested against API
- [ ] Migration guide written
- [ ] Decision: Replace or supplement manual SDKs

**Phase 5 Status**: ⏳ Not Started

---

## Phase 6: Security & Authentication

**Priority**: 🔴 HIGH  
**Estimated Effort**: 1-2 days  
**Dependencies**: Phase 1, Phase 3  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 6.1 Security Schemes in OpenAPI
**Section**: `components.securitySchemes`

- [ ] Document API Key authentication
  ```yaml
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: API key for authentication
  ```
- [ ] Document Bearer token authentication
  ```yaml
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT token for authenticated requests
  ```
- [ ] Document any OAuth2 flows (if applicable)

### 6.2 Endpoint Security Requirements
**Section**: Each path's `security` field

- [ ] Mark public endpoints (no auth required)
  - `GET /v1/passports/:id` (public info)
  - `GET /v1/models` (public search)
  - `GET /v1/compute` (public search)
  - `GET /api-docs/*` (documentation)
  
- [ ] Mark protected endpoints (API key required)
  - `POST /v1/passports` (create)
  - `PATCH /v1/passports/:id` (update)
  - `DELETE /v1/passports/:id` (delete)
  - `POST /v1/run/inference` (execution)
  - `POST /v1/chat/completions` (execution)
  - All payout endpoints
  - All anchoring endpoints

### 6.3 Authentication Middleware
**File**: `Lucid-L2-main/offchain/src/middleware/auth.ts`

- [ ] Implement API key validation
- [ ] Implement Bearer token validation
- [ ] Add rate limiting per API key
- [ ] Log authentication attempts

### 6.4 Security Documentation
**Section**: OpenAPI `info.description` and `externalDocs`

- [ ] Document how to obtain API keys
- [ ] Document rate limits
- [ ] Document error responses for auth failures
- [ ] Add security best practices

### Phase 6 Completion Checklist
- [ ] Security schemes documented in OpenAPI
- [ ] All endpoints have correct security requirements
- [ ] Authentication middleware implemented
- [ ] Rate limiting added
- [ ] Security documentation complete

**Phase 6 Status**: ⏳ Not Started

---

## Phase 7: API Versioning Strategy

**Priority**: 🟡 MEDIUM  
**Estimated Effort**: 1 day  
**Dependencies**: Phase 1  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 7.1 Versioning Approach
**Decision**: URL-based versioning (`/v1/`, `/v2/`)

- [ ] Document versioning strategy in OpenAPI spec
- [ ] Add version info to `info` section
- [ ] Create deprecation policy

**Documentation:**
```yaml
info:
  title: LucidLayer API
  version: 1.0.0
  x-api-version: v1
  description: |
    ## API Versioning
    
    The LucidLayer API uses URL-based versioning. The current version is `v1`.
    
    ### Versioning Policy
    - Major versions (v1, v2) may have breaking changes
    - Minor updates are backward compatible
    - Deprecated endpoints are supported for 6 months
    
    ### Version History
    - v1.0.0 (2026-01-12): Initial release
```

### 7.2 Deprecation Headers
- [ ] Add `Deprecation` header support
- [ ] Add `Sunset` header support
- [ ] Implement deprecation warnings

### 7.3 Version Routing
**File**: `Lucid-L2-main/offchain/src/index.ts`

- [ ] Create versioned router structure
- [ ] Support multiple versions simultaneously (when needed)
- [ ] Add version detection middleware

### Phase 7 Completion Checklist
- [ ] Versioning strategy documented
- [ ] Deprecation policy defined
- [ ] Version headers implemented
- [ ] Router supports versioning

**Phase 7 Status**: ⏳ Not Started

---

## Phase 8: Testing & Documentation

**Priority**: 🟡 MEDIUM  
**Estimated Effort**: 2 days  
**Dependencies**: Phases 1-3 (core implementation)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 8.1 OpenAPI Spec Validation
- [ ] Install Spectral linter
  ```bash
  npm install -D @stoplight/spectral-cli
  ```
- [ ] Create `.spectral.yaml` ruleset
- [ ] Validate spec against OpenAPI 3.1
- [ ] Fix all validation errors
- [ ] Add validation to npm scripts

### 8.2 Contract Testing
**File**: `Lucid-L2-main/offchain/src/__tests__/contract/`

- [ ] Install Prism or similar tool
- [ ] Test all endpoints against OpenAPI spec
- [ ] Verify request/response contracts
- [ ] Add to CI pipeline

### 8.3 Documentation Files
**Directory**: `Lucid-L2-main/docs/`

- [ ] `docs/OPENAPI_GUIDE.md` - How to use OpenAPI features
- [ ] `docs/API_AUTHENTICATION.md` - Authentication guide
- [ ] `docs/API_VERSIONING.md` - Versioning policy
- [ ] `docs/SDK_GENERATION.md` - How to regenerate SDKs

### 8.4 Export Collections
- [ ] Export Postman collection from OpenAPI
  ```bash
  npx openapi-to-postmanv2 -s openapi.yaml -o postman-collection.json
  ```
- [ ] Export Insomnia collection
- [ ] Add collection files to repo

### 8.5 Update Main Documentation
**File**: `Lucid-L2-main/README.md`

- [ ] Add OpenAPI documentation section
- [ ] Link to Swagger UI
- [ ] Add SDK generation instructions
- [ ] Update API reference links

### Phase 8 Completion Checklist
- [ ] OpenAPI spec validated (no errors)
- [ ] Contract tests passing
- [ ] Documentation files created
- [ ] Postman/Insomnia collections exported
- [ ] README updated

**Phase 8 Status**: ⏳ Not Started

---

## Phase 9: CI/CD Integration

**Priority**: 🟢 LOW  
**Estimated Effort**: 1-2 days  
**Dependencies**: Phases 1-8 (all core phases)  
**Assigned To**: _______________  
**Start Date**: _______________  
**Target Date**: _______________

### 9.1 CI Pipeline Updates
**File**: `.github/workflows/ci.yml` (or equivalent)

- [ ] Add OpenAPI spec validation step
- [ ] Add contract testing step
- [ ] Add SDK generation verification
- [ ] Fail build on spec validation errors

**GitHub Actions Example:**
```yaml
- name: Validate OpenAPI Spec
  run: |
    npx @stoplight/spectral-cli lint openapi.yaml

- name: Run Contract Tests
  run: |
    npm run test:contract

- name: Verify SDK Generation
  run: |
    speakeasy generate sdk --schema openapi.yaml --lang typescript --out /tmp/sdk
    echo "SDK generation successful"
```

### 9.2 Documentation Deployment
- [ ] Set up automatic Swagger UI deployment
- [ ] Deploy to GitHub Pages (or similar)
- [ ] Configure custom domain (optional)
- [ ] Add to deployment workflow

### 9.3 SDK Publishing Automation
- [ ] Auto-publish TypeScript SDK on release
- [ ] Auto-publish Python SDK on release
- [ ] Version SDKs with API version
- [ ] Generate changelogs

### 9.4 Changelog Generation
- [ ] Set up changelog generation from OpenAPI diff
- [ ] Document breaking changes automatically
- [ ] Notify users of deprecations

### Phase 9 Completion Checklist
- [ ] CI validates OpenAPI spec
- [ ] Contract tests in CI
- [ ] Documentation auto-deployed
- [ ] SDK publishing automated
- [ ] Changelog generation working

**Phase 9 Status**: ⏳ Not Started

---

## Timeline Summary

| Phase | Duration | Dependencies | Parallel? |
|-------|----------|--------------|-----------|
| 1. OpenAPI Specification | 2-3 days | None | - |
| 2. Swagger UI | 1 day | Phase 1 (partial) | ✅ Can start early |
| 3. Validation Middleware | 2-3 days | Phase 1 | ✅ After Phase 1 |
| 4. Schema Sync | 2 days | Phase 1 | ✅ Parallel with 3 |
| 5. Speakeasy SDK | 3-4 days | Phase 1 | ✅ After Phase 1 |
| 6. Security & Auth | 1-2 days | Phase 1, 3 | ✅ Parallel with 5 |
| 7. API Versioning | 1 day | Phase 1 | ✅ Parallel with 5 |
| 8. Testing & Docs | 2 days | Phases 1-3 | - |
| 9. CI/CD | 1-2 days | All phases | - |
| **Total (Sequential)** | **15-18 days** | | |
| **Total (Parallelized)** | **10-12 days** | | ✅ Optimized |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OpenAPI Version | 3.1.0 | Latest standard, JSON Schema compatible |
| Validation Library | express-openapi-validator | Well-maintained, full-featured |
| SDK Generation | Speakeasy | High-quality output, good streaming support |
| API Versioning | URL-based (/v1/) | Clear, widely adopted pattern |
| Authentication | API Key + Bearer | Flexible for different use cases |

---

## Risk Register

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| OpenAPI 3.1 compatibility issues | Low | Medium | Use well-tested tools | Open |
| Speakeasy SDK doesn't support streaming | Medium | High | Evaluate early, have fallback | Open |
| Breaking changes from AJV → OpenAPI | Low | Medium | Comprehensive testing | Open |
| Performance overhead from validation | Low | Medium | Disable response validation in prod | Open |

---

## Effort Tracking

### Estimated vs Actual Effort

| Phase | Estimated | Actual | Variance | Notes |
|-------|-----------|--------|----------|-------|
| Phase 1 | 2-3 days | | | |
| Phase 2 | 1 day | | | |
| Phase 3 | 2-3 days | | | |
| Phase 4 | 2 days | | | |
| Phase 5 | 3-4 days | | | |
| Phase 6 | 1-2 days | | | |
| Phase 7 | 1 day | | | |
| Phase 8 | 2 days | | | |
| Phase 9 | 1-2 days | | | |
| **Total** | **15-20 days** | | | |

---

## Change History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | AI Assistant | Initial document creation |
| | | | |

---

**Document Owner**: _______________  
**Last Review Date**: _______________  
**Next Review Date**: _______________
