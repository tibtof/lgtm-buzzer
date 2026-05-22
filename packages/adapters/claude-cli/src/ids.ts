/**
 * Re-exports `IdGenerator` and `defaultIdGenerator` from `@lgtm-buzzer/adapter-shared`.
 *
 * These were extracted to `_shared` by ADR-20 so that both `claude-cli` and
 * `claude-api` use the same type. The public API of this module is unchanged.
 */
export type { IdGenerator } from "@lgtm-buzzer/adapter-shared";
export { defaultIdGenerator } from "@lgtm-buzzer/adapter-shared";
