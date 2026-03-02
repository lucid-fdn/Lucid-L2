# SystemHealthStatus

## Example Usage

```typescript
import { SystemHealthStatus } from "@lucid/sdk/models";

let value: SystemHealthStatus = "degraded";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"healthy" | "degraded" | "down" | Unrecognized<string>
```