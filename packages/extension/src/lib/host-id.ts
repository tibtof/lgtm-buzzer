/**
 * Identifier for the native messaging host the extension connects to.
 *
 * Native messaging host names must match `^[a-z0-9_]+(\.[a-z0-9_]+)*$`
 * (dot-separated, lowercase, underscores — no hyphens), which is why the
 * package's `lgtm-buzzer` slug becomes `lgtm_buzzer` here.
 */
export const NATIVE_HOST_ID = "com.lgtm_buzzer.host" as const;
