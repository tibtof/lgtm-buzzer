/**
 * Public barrel for the options layer.
 *
 * The entrypoint (`entrypoints/options/main.ts`) imports from this barrel.
 * The service worker imports `readSwOptions` directly from `./storage-reader`.
 *
 * ADR-29: `StoredCredentialsMap` and `adapter-creds` exports are REMOVED.
 *         `createCheckAuth` / `CheckAuth` / `CheckAuthError` are added.
 */
export {
  STORAGE_KEY,
  SCHEMA_VERSION,
  StoredOptionsSchema,
  DEFAULT_OPTIONS,
  type StoredOptions,
} from "./schema.js";

export {
  createOptionsStore,
  type OptionsStore,
  type StorageArea,
  type StorageError,
} from "./storage.js";

export {
  readSwOptions,
  type SwOptionsProjection,
} from "./storage-reader.js";

export {
  createSWBridge,
  createListAdapters,
} from "./sw-bridge.js";

export {
  createProbe,
  type Probe,
  type ProbeError,
} from "./probe.js";

export {
  createCheckAuth,
  type CheckAuth,
  type CheckAuthError,
} from "./auth-status.js";

export {
  createOptionsView,
  type OptionsView,
  type OptionsDOMDeps,
  type AdapterCatalog,
  type ListAdaptersError,
} from "./dom.js";
