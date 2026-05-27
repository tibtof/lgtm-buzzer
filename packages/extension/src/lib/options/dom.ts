import { type Either } from "monadyssey";
import type { OptionsStore, StorageError } from "./storage.js";
import type { StoredOptions } from "./schema.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { Probe, ProbeError } from "./probe.js";
import type { CheckAuth, CheckAuthError } from "./auth-status.js";
import type { AuthStatus } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Exported types (imported by sw-bridge, probe, and the entrypoint)
// ---------------------------------------------------------------------------

/**
 * The adapter catalog returned by the host on a `list-adapters-request`.
 */
export type AdapterCatalog = {
  readonly llm: readonly string[];
  readonly vcs: readonly string[];
};

/**
 * Errors that can occur when calling `listAdapters`.
 */
export type ListAdaptersError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "host-error"; readonly reason: string; readonly message: string }
  | { readonly kind: "internal"; readonly message: string };

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

/** Logger surface used by the options DOM module. */
export type OptionsDOMLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/** Dependencies injected into `createOptionsView`. */
export type OptionsDOMDeps = {
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly store: OptionsStore;
  readonly listAdapters: () => Promise<Either<ListAdaptersError, AdapterCatalog>>;
  readonly probe: Probe;
  readonly checkAuth: CheckAuth;
  readonly logger?: OptionsDOMLogger;
};

/** Public surface of the options view. */
export type OptionsView = {
  /** Mounts the view, hydrates form, loads adapters. */
  readonly mount: () => Promise<void>;
  /** Removes all DOM content from root. */
  readonly unmount: () => void;
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const el = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Partial<Record<string, string>> = {},
): HTMLElementTagNameMap[K] => {
  const elem = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) elem.setAttribute(key, value);
  }
  return elem;
};

const textEl = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text: string,
  attrs: Partial<Record<string, string>> = {},
): HTMLElementTagNameMap[K] => {
  const elem = el(doc, tag, attrs);
  elem.textContent = text;
  return elem;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the options page view that renders into the supplied `root` element.
 *
 * ADR-29: credential inputs and VCS dropdown are REMOVED. The view now shows:
 * - LLM adapter dropdown (only user preference left).
 * - Auth-status panel with one row per adapter and a refresh button.
 * - Test connection button (sends `ping` with `llmAdapterId` only).
 *
 * Designed to be mounted inside a caller-supplied `<main>` element so that
 * jsdom tests can mount it without touching `document.body`.
 *
 * @param deps - Injected dependencies.
 */
export const createOptionsView = (deps: OptionsDOMDeps): OptionsView => {
  const { doc, root, store, listAdapters, probe, checkAuth } = deps;

  // ---------------------------------------------------------------------------
  // Internal state — mutable, scoped to the factory
  // ---------------------------------------------------------------------------

  let selectedLlm = "";
  // ADR-32: pool size. Default 5 (matches the protocol default).
  let selectedPoolSize: 5 | 10 | 20 = 5;

  // ---------------------------------------------------------------------------
  // Banner helpers
  // ---------------------------------------------------------------------------

  const clearBanner = (): void => {
    root.querySelector("[data-lgtm-banner]")?.remove();
  };

  const showBanner = (
    message: string,
    kind: "info" | "success" | "error" | "warning",
    dismissable = false,
  ): void => {
    clearBanner();
    const banner = el(doc, "div", {
      "data-lgtm-banner": "",
      "data-lgtm-banner-kind": kind,
      role: "alert",
    });
    const msg = textEl(doc, "span", message);
    banner.appendChild(msg);

    if (dismissable) {
      const closeBtn = textEl(doc, "button", "×", {
        "aria-label": "Dismiss",
        "data-lgtm-dismiss": "",
      });
      closeBtn.addEventListener("click", () => { banner.remove(); });
      banner.appendChild(closeBtn);
    }

    root.insertBefore(banner, root.firstChild);
  };

  // ---------------------------------------------------------------------------
  // Auth-status panel helpers
  // ---------------------------------------------------------------------------

  const renderAuthStatusRows = (
    panel: HTMLElement,
    statuses: ReadonlyArray<AuthStatus>,
  ): void => {
    // Clear existing rows (but leave the heading and refresh button).
    const existing = panel.querySelectorAll("[data-lgtm-auth-row]");
    for (const row of existing) { row.remove(); }

    for (const status of statuses) {
      const row = el(doc, "div", {
        "data-lgtm-auth-row": status.adapterId,
        "data-lgtm-auth-ok": String(status.ok),
      });

      const statusIcon = textEl(doc, "span", status.ok ? "✓" : "✗", {
        "data-lgtm-auth-icon": "",
      });
      const idLabel = textEl(doc, "span", status.adapterId, {
        "data-lgtm-auth-adapter-id": "",
      });
      row.appendChild(statusIcon);
      row.appendChild(idLabel);

      const detailText = status.ok
        ? (status.detail ?? "")
        : (status.hint ?? "");

      if (detailText !== "") {
        const detail = textEl(doc, "span", detailText, {
          "data-lgtm-auth-detail": "",
        });
        row.appendChild(detail);
      }

      panel.appendChild(row);
    }
  };

  const renderAuthStatusError = (
    panel: HTMLElement,
    err: CheckAuthError,
  ): void => {
    const existing = panel.querySelectorAll("[data-lgtm-auth-row]");
    for (const row of existing) { row.remove(); }

    const banner = el(doc, "div", { "data-lgtm-auth-error-banner": "" });
    if (err.kind === "host-not-installed") {
      banner.textContent =
        "Native host not installed. Run the host install script and reload.";
    } else {
      banner.textContent =
        err.kind === "host-error" ? err.message : err.message;
    }
    panel.appendChild(banner);
  };

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------

  const mount = async (): Promise<void> => {
    root.innerHTML = "";

    const heading = textEl(doc, "h1", "LGTM Buzzer Options");
    root.appendChild(heading);

    // ---- Adapter selection section ----------------------------------------
    const adapterSection = el(doc, "section", { "data-lgtm-section": "adapters" });
    const adapterHeading = textEl(doc, "h2", "Adapter selection");
    adapterSection.appendChild(adapterHeading);

    // LLM select — the only selection remaining after ADR-29.
    const llmGroup = el(doc, "div", { "data-lgtm-group": "llm" });
    const llmLabel = textEl(doc, "label", "LLM adapter", { for: "lgtm-llm-select" });
    const llmSelect = el(doc, "select", {
      id: "lgtm-llm-select",
      "data-lgtm-select": "llm",
    }) as HTMLSelectElement;
    llmGroup.appendChild(llmLabel);
    llmGroup.appendChild(llmSelect);
    adapterSection.appendChild(llmGroup);

    // NOTE: VCS dropdown removed in ADR-29 — VCS is auto-picked from pr.kind.
    // NOTE: Credential input sections removed in ADR-29 — credentials are host-resolved.

    root.appendChild(adapterSection);

    // ---- Quiz behavior section (ADR-32) ----------------------------------
    const quizBehaviorSection = el(doc, "section", { "data-lgtm-section": "quiz-behavior" });
    const quizBehaviorHeading = textEl(doc, "h2", "Quiz behavior");
    quizBehaviorSection.appendChild(quizBehaviorHeading);

    const poolGroup = el(doc, "div", { "data-lgtm-group": "pool-size" });
    const poolLabel = textEl(doc, "label", "Question pool size", { for: "lgtm-pool-size" });
    const poolSelect = el(doc, "select", {
      id: "lgtm-pool-size",
      "data-lgtm-select": "pool-size",
    }) as HTMLSelectElement;

    const poolOptions: Array<{ value: 5 | 10 | 20; label: string }> = [
      { value: 5, label: "5 — Fastest first quiz, no retry cache" },
      { value: 10, label: "10 — Balanced (recommended)" },
      { value: 20, label: "20 — Most retry variety, slower first quiz" },
    ];
    for (const { value, label } of poolOptions) {
      const opt = textEl(doc, "option", label, { value: String(value) });
      poolSelect.appendChild(opt);
    }

    poolGroup.appendChild(poolLabel);
    poolGroup.appendChild(poolSelect);
    quizBehaviorSection.appendChild(poolGroup);
    root.appendChild(quizBehaviorSection);

    // ---- Auth-status panel -----------------------------------------------
    const authPanel = el(doc, "section", { "data-lgtm-section": "auth-status" });
    const authHeading = textEl(doc, "h2", "Authentication status");
    authPanel.appendChild(authHeading);

    const refreshBtn = textEl(doc, "button", "Refresh", {
      "data-lgtm-btn": "refresh-auth",
    }) as HTMLButtonElement;
    authPanel.appendChild(refreshBtn);

    root.appendChild(authPanel);

    // ---- Action buttons ---------------------------------------------------
    const actionsDiv = el(doc, "div", { "data-lgtm-actions": "" });

    const saveBtn = textEl(doc, "button", "Save", {
      "data-lgtm-btn": "save",
    }) as HTMLButtonElement;

    const testBtn = textEl(doc, "button", "Test connection", {
      "data-lgtm-btn": "test",
    }) as HTMLButtonElement;

    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(testBtn);
    root.appendChild(actionsDiv);

    // ---- Read stored options ----------------------------------------------
    let storedLlm = "";
    let storedPoolSize: 5 | 10 | 20 = 5;

    const storedResult = await store.read();
    storedResult.fold(
      (err: StorageError) => {
        if (err.kind === "corrupt") {
          showBanner(
            "Stored options were corrupt and have been reset.",
            "warning",
            true,
          );
        }
        // absent is normal first-run; falls through to defaults
      },
      (opts) => {
        storedLlm = opts.llmAdapterId ?? "";
        storedPoolSize = opts.questionPoolSize ?? 5;
      },
    );

    // Hydrate pool-size select from stored value.
    poolSelect.value = String(storedPoolSize);
    selectedPoolSize = storedPoolSize;

    // ---- Load adapter list from host -------------------------------------
    const catalogResult = await listAdapters();
    catalogResult.fold(
      (err: ListAdaptersError) => {
        if (err.kind === "host-not-installed") {
          showBanner(
            "Native host not installed. Run `node packages/host/dist/install-manifest.js` and reload.",
            "error",
          );
        } else {
          const msg = err.kind === "host-error" ? err.message : err.message;
          showBanner(`Failed to load adapters: ${msg}`, "error");
        }
        llmSelect.disabled = true;
        saveBtn.disabled = true;
        testBtn.disabled = true;
        return;
      },
      (cat: AdapterCatalog) => {
        // Populate LLM dropdown only (VCS removed in ADR-29).
        for (const id of cat.llm) {
          const opt = textEl(doc, "option", id, { value: id });
          llmSelect.appendChild(opt);
        }

        // Pre-select stored LLM (or fall back to first option).
        if (storedLlm !== "" && cat.llm.includes(storedLlm)) {
          llmSelect.value = storedLlm;
        } else if (cat.llm.length > 0) {
          llmSelect.value = cat.llm[0] ?? "";
        }

        selectedLlm = llmSelect.value;
      },
    );

    // ---- LLM dropdown change handler --------------------------------------
    llmSelect.addEventListener("change", () => {
      selectedLlm = llmSelect.value;
    });

    // ---- Pool-size dropdown change handler (ADR-32) ----------------------
    poolSelect.addEventListener("change", () => {
      const v = Number(poolSelect.value);
      if (v === 5 || v === 10 || v === 20) {
        selectedPoolSize = v;
      }
    });

    // ---- Auth-status initial load ----------------------------------------
    const loadAuthStatus = async (): Promise<void> => {
      const result = await checkAuth();
      result.fold(
        (err: CheckAuthError) => {
          renderAuthStatusError(authPanel, err);
        },
        (statuses) => {
          renderAuthStatusRows(authPanel, statuses);
        },
      );
    };

    void loadAuthStatus();

    // ---- Refresh auth-status button handler ------------------------------
    refreshBtn.addEventListener("click", () => {
      void loadAuthStatus();
    });

    // ---- Save handler ----------------------------------------------------
    saveBtn.addEventListener("click", async () => {
      clearBanner();

      const options: StoredOptions = {
        schemaVersion: SCHEMA_VERSION,
        llmAdapterId: selectedLlm !== "" ? selectedLlm : undefined,
        // ADR-29: vcsAdapterId and credentials are REMOVED from storage.
        // ADR-32: persist the pool size preference.
        questionPoolSize: selectedPoolSize,
      };

      const writeResult = await store.write(options);
      writeResult.fold(
        (e: StorageError) => {
          const detail = e.kind === "io" ? e.detail : e.kind;
          showBanner(`Failed to save options: ${detail}`, "error");
        },
        () => {
          showBanner("Save successful", "success", true);
        },
      );
    });

    // ---- Test connection handler -----------------------------------------
    testBtn.addEventListener("click", async () => {
      clearBanner();

      // ADR-29: probe called with llmAdapterId only — no credentials.
      const result = await probe({
        llmAdapterId: selectedLlm,
      });

      result.fold(
        (err: ProbeError) => {
          if (err.kind === "host-not-installed") {
            showBanner("Test connection failed: native host not installed.", "error");
          } else if (err.kind === "nonce-mismatch") {
            showBanner(
              "Test connection failed: host returned an unexpected response.",
              "error",
            );
          } else {
            // NEVER include credential bytes — show only the host's message.
            showBanner(`Test connection failed: ${err.message}`, "error");
          }
        },
        () => {
          showBanner("Connection successful!", "success", true);
        },
      );
    });
  };

  // ---------------------------------------------------------------------------
  // Unmount
  // ---------------------------------------------------------------------------

  const unmount = (): void => {
    root.innerHTML = "";
    selectedLlm = "";
    selectedPoolSize = 5;
  };

  return { mount, unmount };
};
