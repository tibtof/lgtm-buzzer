import type { Result } from "@lgtm-buzzer/protocol";
import { ok } from "@lgtm-buzzer/protocol";
import { CORE_VERSION } from "@lgtm-buzzer/core";

/** Stable identifier for the claude-cli adapter. */
export const ADAPTER_ID = "claude-cli" as const;

/** Smoke export: proves the protocol + core imports resolve. */
export const adapterInfo = (): Result<
  { readonly id: typeof ADAPTER_ID; readonly coreVersion: typeof CORE_VERSION },
  never
> => ok({ id: ADAPTER_ID, coreVersion: CORE_VERSION });
