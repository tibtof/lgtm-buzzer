#!/usr/bin/env node
import { HOST_ID } from "./index.js";
import { createPinoLogger } from "./logger.js";
const main = (): void => {
  const logger = createPinoLogger({ bindings: { component: "cli" } });
  logger.info(`${HOST_ID}: placeholder entry. Native messaging wiring lands with the first host ADR.`);
};
main();
