import { type Either, Left, Right } from "monadyssey";
import {
  StoredOptionsSchema,
  STORAGE_KEY,
  type StoredOptions,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Discriminated errors returned by `OptionsStore` operations.
 *
 * - `absent` — nothing stored yet (first run).
 * - `corrupt` — stored value fails schema validation.
 * - `io` — underlying `chrome.storage.local` threw.
 */
export type StorageError =
  | { readonly kind: "absent" }
  | { readonly kind: "corrupt"; readonly issues: ReadonlyArray<string> }
  | { readonly kind: "io"; readonly detail: string };

// ---------------------------------------------------------------------------
// Port types
// ---------------------------------------------------------------------------

/**
 * Minimal `chrome.storage.local`-shaped surface for injection.
 *
 * Tests pass a plain fake; production passes `chrome.storage.local` from
 * `wxt/browser` cast to this shape.
 */
export type StorageArea = {
  readonly get: (key: string) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

/**
 * Port for persisting and retrieving extension options.
 *
 * Every method returns `Promise<Either<StorageError, T>>` so failures are
 * typed and the SW can apply defaults without throwing.
 */
export type OptionsStore = {
  /**
   * Reads stored options. Returns `Left<absent>` when nothing is stored,
   * `Left<corrupt>` when the stored value fails schema validation.
   */
  readonly read: () => Promise<Either<StorageError, StoredOptions>>;

  /**
   * Writes options atomically under `STORAGE_KEY`.
   *
   * Returns `Right<void>` on success, `Left<io>` on quota / OS errors.
   */
  readonly write: (options: StoredOptions) => Promise<Either<StorageError, void>>;

  /**
   * Removes the `STORAGE_KEY` entry entirely.
   *
   * Used by tests and a potential "reset" UI action.
   */
  readonly clear: () => Promise<Either<StorageError, void>>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `OptionsStore` backed by the supplied `StorageArea`.
 *
 * @param deps - Injected storage area (inject `browser.storage.local` in prod).
 */
export const createOptionsStore = (deps: {
  readonly area: StorageArea;
}): OptionsStore => {
  const { area } = deps;

  return {
    read: async (): Promise<Either<StorageError, StoredOptions>> => {
      let bag: Record<string, unknown>;
      try {
        bag = await area.get(STORAGE_KEY);
      } catch (err) {
        return Left.pure<StorageError>({ kind: "io", detail: String(err) });
      }

      const raw = bag[STORAGE_KEY];
      if (raw === undefined || raw === null) {
        return Left.pure<StorageError>({ kind: "absent" });
      }

      const result = StoredOptionsSchema.safeParse(raw);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.message);
        return Left.pure<StorageError>({ kind: "corrupt", issues });
      }

      return Right.pure(result.data);
    },

    write: async (
      options: StoredOptions,
    ): Promise<Either<StorageError, void>> => {
      try {
        await area.set({ [STORAGE_KEY]: options });
        return Right.pure(undefined as void);
      } catch (err) {
        return Left.pure<StorageError>({ kind: "io", detail: String(err) });
      }
    },

    clear: async (): Promise<Either<StorageError, void>> => {
      try {
        await area.remove(STORAGE_KEY);
        return Right.pure(undefined as void);
      } catch (err) {
        return Left.pure<StorageError>({ kind: "io", detail: String(err) });
      }
    },
  };
};
