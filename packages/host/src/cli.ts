#!/usr/bin/env node
import { HOST_ID } from "./index.js";

const main = (): void => {
  process.stderr.write(
    `${HOST_ID}: placeholder entry. Native messaging wiring lands with the first host ADR.\n`,
  );
};

main();
