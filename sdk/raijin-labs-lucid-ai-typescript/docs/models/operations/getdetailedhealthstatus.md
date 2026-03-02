# GetDetailedHealthStatus

## Example Usage

```typescript
import { GetDetailedHealthStatus } from "@lucid/sdk/models/operations";

let value: GetDetailedHealthStatus = "down";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"healthy" | "degraded" | "down" | Unrecognized<string>
```