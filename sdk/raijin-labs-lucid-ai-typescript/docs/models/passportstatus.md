# PassportStatus

## Example Usage

```typescript
import { PassportStatus } from "@lucid/sdk/models";

let value: PassportStatus = "active";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"active" | "deprecated" | "revoked" | Unrecognized<string>
```