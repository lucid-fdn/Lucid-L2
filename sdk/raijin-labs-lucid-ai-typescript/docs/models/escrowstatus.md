# EscrowStatus

## Example Usage

```typescript
import { EscrowStatus } from "@lucid/sdk/models";

let value: EscrowStatus = "Disputed";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"Created" | "Released" | "Refunded" | "Disputed" | Unrecognized<string>
```