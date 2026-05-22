import type { Either } from "monadyssey";
import { Right } from "monadyssey";
import { CORE_VERSION } from "@lgtm-buzzer/core";

/** Stable identifier for the codex-cli adapter. */
export const ADAPTER_ID = "codex-cli" as const;

/** Smoke export: proves the monadyssey + core imports resolve. */
export const adapterInfo = (): Either<
  never,
  { readonly id: typeof ADAPTER_ID; readonly coreVersion: typeof CORE_VERSION }
> => Right.pure({ id: ADAPTER_ID, coreVersion: CORE_VERSION });
