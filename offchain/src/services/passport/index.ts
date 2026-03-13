// PROXY — real implementation moved to @lucid-l2/engine + @lucid-l2/gateway-lite
export * from '../../../packages/engine/src/passport/index';
// matchingEngine and modelCatalog live in gateway-lite (serving layer)
export { hasAvailableCompute, matchComputeForModel } from '../../../packages/gateway-lite/src/compute/matchingEngine';
export type { MatchResult } from '../../../packages/gateway-lite/src/compute/matchingEngine';
export { MODEL_CATALOG } from '../../../packages/gateway-lite/src/compute/modelCatalog';
