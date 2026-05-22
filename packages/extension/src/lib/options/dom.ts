import { type Either } from "monadyssey";
import type { CredentialsBag } from "@lgtm-buzzer/protocol";
import type { OptionsStore, StorageError } from "./storage.js";
import type { StoredOptions } from "./schema.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { Probe, ProbeError } from "./probe.js";
import { getCredsSpec } from "./adapter-creds.js";

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
 * Designed to be mounted inside a caller-supplied `<main>` element so that
 * jsdom tests can mount it without touching `document.body`.
 *
 * @param deps - Injected dependencies.
 */
export const createOptionsView = (deps: OptionsDOMDeps): OptionsView => {
  const { doc, root, store, listAdapters, probe } = deps;

  // ---------------------------------------------------------------------------
  // Internal state — mutable, scoped to the factory
  // ---------------------------------------------------------------------------

  // Current form selections (keyed by select element id).
  let selectedLlm = "";
  let selectedVcs = "";

  // Credential inputs currently in the DOM (keyed by field key).
  let llmCredInputs: Map<string, HTMLInputElement> = new Map();
  let vcsCredInputs: Map<string, HTMLInputElement> = new Map();

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
  // Credential input section
  // ---------------------------------------------------------------------------

  const renderCredInputs = (
    container: HTMLElement,
    adapterId: string,
    currentCreds: Record<string, unknown>,
    inputsMap: Map<string, HTMLInputElement>,
    category: "llm" | "vcs",
  ): void => {
    // Clear existing inputs from the map and container
    inputsMap.clear();
    const existing = container.querySelector(`[data-lgtm-creds="${category}"]`);
    existing?.remove();

    const spec = getCredsSpec(adapterId);
    const section = el(doc, "div", { "data-lgtm-creds": category });

    if (spec === undefined) {
      // Unknown adapter
      const warn = textEl(
        doc,
        "p",
        "Unknown adapter — credentials may be required by the host.",
        { "data-lgtm-unknown-adapter": "" },
      );
      section.appendChild(warn);
    } else if (spec.fields.length === 0) {
      if (spec.note !== undefined) {
        const note = textEl(doc, "p", spec.note, { "data-lgtm-no-creds": "" });
        section.appendChild(note);
      }
    } else {
      for (const field of spec.fields) {
        const fieldDiv = el(doc, "div", { "data-lgtm-field": field.key });

        const label = el(doc, "label");
        label.textContent = field.label;
        label.setAttribute("for", `lgtm-cred-${category}-${field.key}`);

        const input = el(doc, "input", {
          type: "password",
          id: `lgtm-cred-${category}-${field.key}`,
          autocomplete: "off",
          spellcheck: "false",
          placeholder: field.placeholder,
          "data-lgtm-cred-input": field.key,
        }) as HTMLInputElement;

        // Pre-fill from stored credentials (value never logged).
        const stored = currentCreds[field.key];
        if (typeof stored === "string") {
          input.value = stored;
        }

        inputsMap.set(field.key, input);
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        section.appendChild(fieldDiv);
      }
    }

    container.appendChild(section);
  };

  // ---------------------------------------------------------------------------
  // Collect form credentials
  // ---------------------------------------------------------------------------

  const collectCreds = (
    adapterId: string,
    inputsMap: Map<string, HTMLInputElement>,
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    const spec = getCredsSpec(adapterId);
    if (spec === undefined) return result;
    for (const field of spec.fields) {
      const input = inputsMap.get(field.key);
      if (input !== undefined) {
        result[field.key] = input.value;
      }
    }
    return result;
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

    // LLM select
    const llmGroup = el(doc, "div", { "data-lgtm-group": "llm" });
    const llmLabel = textEl(doc, "label", "LLM adapter", { for: "lgtm-llm-select" });
    const llmSelect = el(doc, "select", {
      id: "lgtm-llm-select",
      "data-lgtm-select": "llm",
    }) as HTMLSelectElement;
    llmGroup.appendChild(llmLabel);
    llmGroup.appendChild(llmSelect);
    adapterSection.appendChild(llmGroup);

    // LLM credential inputs container
    const llmCredsContainer = el(doc, "div", {
      "data-lgtm-creds-container": "llm",
    });
    adapterSection.appendChild(llmCredsContainer);

    // VCS select
    const vcsGroup = el(doc, "div", { "data-lgtm-group": "vcs" });
    const vcsLabel = textEl(doc, "label", "VCS adapter", { for: "lgtm-vcs-select" });
    const vcsSelect = el(doc, "select", {
      id: "lgtm-vcs-select",
      "data-lgtm-select": "vcs",
    }) as HTMLSelectElement;
    vcsGroup.appendChild(vcsLabel);
    vcsGroup.appendChild(vcsSelect);
    adapterSection.appendChild(vcsGroup);

    // VCS credential inputs container
    const vcsCredsContainer = el(doc, "div", {
      "data-lgtm-creds-container": "vcs",
    });
    adapterSection.appendChild(vcsCredsContainer);

    root.appendChild(adapterSection);

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

    // ---- Footnote ---------------------------------------------------------
    const footnote = textEl(
      doc,
      "p",
      "Note: credentials are stored in plaintext in chrome.storage.local (v1 limitation).",
      { "data-lgtm-footnote": "" },
    );
    root.appendChild(footnote);

    // ---- Read stored options ----------------------------------------------
    let storedLlm = "";
    let storedVcs = "";
    let storedCreds: Record<string, CredentialsBag> = {};

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
        // absent is normal first-run; io falls through to defaults
      },
      (opts) => {
        storedLlm = opts.llmAdapterId ?? "";
        storedVcs = opts.vcsAdapterId ?? "";
        // Build typed copy of credentials
        storedCreds = { ...(opts.credentials ?? {}) };
      },
    );

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
          const msg =
            err.kind === "host-error" ? err.message : err.message;
          showBanner(`Failed to load adapters: ${msg}`, "error");
        }
        llmSelect.disabled = true;
        vcsSelect.disabled = true;
        saveBtn.disabled = true;
        testBtn.disabled = true;
        return;
      },
      (cat: AdapterCatalog) => {
        // Populate LLM dropdown
        for (const id of cat.llm) {
          const opt = textEl(doc, "option", id, { value: id });
          llmSelect.appendChild(opt);
        }

        // Populate VCS dropdown
        for (const id of cat.vcs) {
          const opt = textEl(doc, "option", id, { value: id });
          vcsSelect.appendChild(opt);
        }

        // Pre-select stored values (or fall back to first option).
        if (storedLlm !== "" && cat.llm.includes(storedLlm)) {
          llmSelect.value = storedLlm;
        } else if (cat.llm.length > 0) {
          llmSelect.value = cat.llm[0] ?? "";
        }

        if (storedVcs !== "" && cat.vcs.includes(storedVcs)) {
          vcsSelect.value = storedVcs;
        } else if (cat.vcs.length > 0) {
          vcsSelect.value = cat.vcs[0] ?? "";
        }

        selectedLlm = llmSelect.value;
        selectedVcs = vcsSelect.value;

        // Render initial credential inputs.
        llmCredInputs = new Map();
        vcsCredInputs = new Map();
        renderCredInputs(
          llmCredsContainer,
          selectedLlm,
          storedCreds[selectedLlm] ?? {},
          llmCredInputs,
          "llm",
        );
        renderCredInputs(
          vcsCredsContainer,
          selectedVcs,
          storedCreds[selectedVcs] ?? {},
          vcsCredInputs,
          "vcs",
        );
      },
    );

    // ---- Dropdown change handlers ----------------------------------------
    llmSelect.addEventListener("change", () => {
      selectedLlm = llmSelect.value;
      llmCredInputs = new Map();
      renderCredInputs(
        llmCredsContainer,
        selectedLlm,
        storedCreds[selectedLlm] ?? {},
        llmCredInputs,
        "llm",
      );
    });

    vcsSelect.addEventListener("change", () => {
      selectedVcs = vcsSelect.value;
      vcsCredInputs = new Map();
      renderCredInputs(
        vcsCredsContainer,
        selectedVcs,
        storedCreds[selectedVcs] ?? {},
        vcsCredInputs,
        "vcs",
      );
    });

    // ---- Save handler ----------------------------------------------------
    saveBtn.addEventListener("click", async () => {
      clearBanner();

      const llmCreds = collectCreds(selectedLlm, llmCredInputs);
      const vcsCreds = collectCreds(selectedVcs, vcsCredInputs);

      // Validate required fields (non-empty).
      const llmSpec = getCredsSpec(selectedLlm);
      if (llmSpec !== undefined) {
        for (const field of llmSpec.fields) {
          if (!llmCreds[field.key]) {
            showBanner(
              `${field.label} is required for ${selectedLlm}.`,
              "error",
            );
            return;
          }
        }
      }
      const vcsSpec = getCredsSpec(selectedVcs);
      if (vcsSpec !== undefined) {
        for (const field of vcsSpec.fields) {
          if (!vcsCreds[field.key]) {
            showBanner(
              `${field.label} is required for ${selectedVcs}.`,
              "error",
            );
            return;
          }
        }
      }

      // Merge into credentials map — preserve other adapters' stored values.
      const existingCredsResult = await store.read();
      const existingCreds: Record<string, CredentialsBag> = {};
      existingCredsResult.fold(
        () => { /* use empty on error */ },
        (opts) => {
          const c = opts.credentials ?? {};
          for (const [k, v] of Object.entries(c)) {
            existingCreds[k] = v;
          }
        },
      );

      if (Object.keys(llmCreds).length > 0) {
        existingCreds[selectedLlm] = llmCreds;
      }
      if (Object.keys(vcsCreds).length > 0) {
        existingCreds[selectedVcs] = vcsCreds;
      }

      const options: StoredOptions = {
        schemaVersion: SCHEMA_VERSION,
        llmAdapterId: selectedLlm !== "" ? selectedLlm : undefined,
        vcsAdapterId: selectedVcs !== "" ? selectedVcs : undefined,
        credentials:
          Object.keys(existingCreds).length > 0 ? existingCreds : undefined,
      };

      const writeResult = await store.write(options);
      writeResult.fold(
        (e: StorageError) => {
          const detail = e.kind === "io" ? e.detail : e.kind;
          showBanner(`Failed to save options: ${detail}`, "error");
        },
        () => {
          // Update local storedCreds so subsequent saves accumulate correctly.
          for (const [k, v] of Object.entries(existingCreds)) {
            storedCreds[k] = v;
          }
          showBanner("Save successful", "success", true);
        },
      );
    });

    // ---- Test connection handler -----------------------------------------
    testBtn.addEventListener("click", async () => {
      clearBanner();

      // Read current form state (NOT storage — the user may not have saved yet).
      const llmCreds = collectCreds(selectedLlm, llmCredInputs);
      const vcsCreds = collectCreds(selectedVcs, vcsCredInputs);
      // Merge for probe input — credentials must not be logged.
      const mergedCreds: Record<string, string> = { ...llmCreds, ...vcsCreds };

      const result = await probe({
        llmAdapterId: selectedLlm,
        vcsAdapterId: selectedVcs,
        credentials: mergedCreds,
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
          } else if (err.kind === "host-error") {
            if (err.reason === "bad-credentials") {
              showBanner(
                "Credentials rejected by the adapter. Re-enter and try again.",
                "error",
              );
            } else {
              // NEVER include credential bytes — show only the host's message.
              showBanner(`Test connection failed: ${err.message}`, "error");
            }
          } else {
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
    selectedVcs = "";
    llmCredInputs = new Map();
    vcsCredInputs = new Map();
  };

  return { mount, unmount };
};
