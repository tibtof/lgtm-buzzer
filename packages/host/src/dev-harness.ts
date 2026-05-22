/**
 * Dev harness for running @lgtm-buzzer/host locally without installing
 * the native messaging manifest into Chrome's per-OS config directory.
 *
 * Real harness logic (spawn host, send length-prefixed JSON over stdio,
 * decode framed responses) lands with the first host ADR. Today this
 * file exists so the build graph sees it and so the file path
 * referenced in PLAN.md / CLAUDE.md is real.
 */
import { HOST_ID } from "./index.js";
import { createPinoLogger } from "./logger.js";

const main = (): void => {
  const logger = createPinoLogger({ bindings: { component: "dev-harness" } });
  logger.info(`${HOST_ID} dev-harness: placeholder — wire stdio framing in the host ADR.`);
};
main();
