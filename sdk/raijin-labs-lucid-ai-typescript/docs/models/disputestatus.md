# DisputeStatus

## Example Usage

```typescript
import { DisputeStatus } from "@lucid/sdk/models";

let value: DisputeStatus = "EvidencePhase";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"Open" | "EvidencePhase" | "Resolved" | "Appealed" | Unrecognized<string>
```