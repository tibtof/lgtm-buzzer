import { describe, expect, it, beforeEach } from "vitest";
import { Right, Left } from "monadyssey";
import { createOptionsView, type ListAdaptersError, type AdapterCatalog } from "./dom.js";
import { createOptionsStore } from "./storage.js";
import type { Probe, ProbeError } from "./probe.js";
import type { StoredOptions } from "./schema.js";
import type { Either } from "monadyssey";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const makeFakeStore = (initial?: StoredOptions) => {
  const data: Record<string, unknown> = initial !== undefined
    ? { "lgtm_buzzer.options.v1": initial }
    : {};
  const area = {
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) { data[k] = v; }
    },
    remove: async (key: string) => {
      delete data[key]; // storage area test fake — key is safe
    },
  };
  return createOptionsStore({ area });
};

// A catalog where cli adapters (no creds) are available for both llm and vcs.
// For VCS we use a fake "no-creds-vcs" that isn't in the spec (unknown adapter
// path) so save doesn't require credentials.
const fakeCatalog: AdapterCatalog = {
  llm: ["claude-cli", "claude-api"],
  vcs: ["github", "ado"],
};

// Catalog with no-creds VCS for tests that just need save to succeed easily.
const noCredsVcsCatalog: AdapterCatalog = {
  llm: ["claude-cli", "claude-api"],
  vcs: ["fake-vcs-no-creds"],
};

const makeListAdapters =
  (result: Either<ListAdaptersError, AdapterCatalog>) =>
    async () => result;

const okResult: Either<ProbeError, "ok"> = Right.pure("ok" as const);

const makeProbe = (
  result: Either<ProbeError, "ok">,
): Probe => async () => result;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mountView = async (opts?: {
  initial?: StoredOptions;
  catalogResult?: Either<ListAdaptersError, AdapterCatalog>;
  probe?: Probe;
}) => {
  const store = makeFakeStore(opts?.initial);
  const root = document.createElement("main");
  document.body.appendChild(root);

  const view = createOptionsView({
    doc: document,
    root,
    store,
    listAdapters: makeListAdapters(
      opts?.catalogResult ?? Right.pure(fakeCatalog),
    ),
    probe: opts?.probe ?? makeProbe(okResult),
  });

  await view.mount();
  return { root, store, view };
};

describe("createOptionsView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // 1. Mount with empty storage + fake listAdapters → dropdowns populated
  it("populates both dropdowns with adapter IDs from catalog", async () => {
    const { root } = await mountView();

    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    const vcsSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='vcs']");

    expect(llmSelect).not.toBeNull();
    expect(vcsSelect).not.toBeNull();

    const llmOptions = Array.from(llmSelect!.options).map((o) => o.value);
    const vcsOptions = Array.from(vcsSelect!.options).map((o) => o.value);

    expect(llmOptions).toContain("claude-cli");
    expect(llmOptions).toContain("claude-api");
    expect(vcsOptions).toContain("github");
    expect(vcsOptions).toContain("ado");
  });

  // 2. Selecting claude-api → apiKey credential input appears
  it("shows apiKey input when claude-api is selected", async () => {
    const { root } = await mountView();

    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    expect(llmSelect).not.toBeNull();

    llmSelect!.value = "claude-api";
    llmSelect!.dispatchEvent(new Event("change"));

    const apiKeyInput = root.querySelector<HTMLInputElement>(
      "[data-lgtm-cred-input='apiKey']",
    );
    expect(apiKeyInput).not.toBeNull();
    expect(apiKeyInput!.type).toBe("password");
  });

  // 3. Selecting claude-cli → no input, "no credentials required" note
  it("shows 'no credentials required' note when claude-cli is selected", async () => {
    const { root } = await mountView();

    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    expect(llmSelect).not.toBeNull();

    // First switch to claude-api to trigger re-render
    llmSelect!.value = "claude-api";
    llmSelect!.dispatchEvent(new Event("change"));

    // Now switch back to claude-cli
    llmSelect!.value = "claude-cli";
    llmSelect!.dispatchEvent(new Event("change"));

    const apiKeyInput = root.querySelector("[data-lgtm-cred-input='apiKey']");
    expect(apiKeyInput).toBeNull();

    const note = root.querySelector("[data-lgtm-no-creds]");
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe("no credentials required");
  });

  // 4. Save → store.write called with expected StoredOptions
  it("clicking Save calls store.write with the form's options", async () => {
    const store = makeFakeStore();
    const root = document.createElement("main");
    document.body.appendChild(root);

    // Use a catalog where VCS also requires no creds (unknown to spec → no validation)
    const view = createOptionsView({
      doc: document,
      root,
      store,
      listAdapters: makeListAdapters(Right.pure(noCredsVcsCatalog)),
      probe: makeProbe(okResult),
    });
    await view.mount();

    // Select claude-api → fill in apiKey
    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    llmSelect!.value = "claude-api";
    llmSelect!.dispatchEvent(new Event("change"));

    const apiKeyInput = root.querySelector<HTMLInputElement>(
      "[data-lgtm-cred-input='apiKey']",
    );
    expect(apiKeyInput).not.toBeNull();
    apiKeyInput!.value = "sk-ant-test";

    const saveBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='save']");
    expect(saveBtn).not.toBeNull();
    saveBtn!.click();

    // Wait for async save
    await new Promise((r) => setTimeout(r, 10));

    let savedLlmAdapterId: string | undefined;
    let savedApiKey: string | undefined;

    const readResult = await store.read();
    readResult.fold(
      () => { /* noop — should be Right */ },
      (opts) => {
        savedLlmAdapterId = opts.llmAdapterId;
        savedApiKey = opts.credentials?.["claude-api"]
          ? (opts.credentials["claude-api"] as Record<string, unknown>)["apiKey"] as string
          : undefined;
      },
    );
    expect(savedLlmAdapterId).toBe("claude-api");
    expect(savedApiKey).toBe("sk-ant-test");
  });

  // 5. Save → success banner rendered; dismiss button hides it
  it("shows dismissable 'Save successful' banner after save", async () => {
    // Use noCredsVcsCatalog so VCS doesn't require PAT
    const store = makeFakeStore();
    const root = document.createElement("main");
    document.body.appendChild(root);

    const view = createOptionsView({
      doc: document,
      root,
      store,
      listAdapters: makeListAdapters(Right.pure(noCredsVcsCatalog)),
      probe: makeProbe(okResult),
    });
    await view.mount();

    // LLM is claude-cli by default (no creds), VCS is fake-vcs-no-creds (unknown → no creds)
    const saveBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='save']");
    saveBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    const banner = root.querySelector("[data-lgtm-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Save successful");

    // Dismiss
    const dismissBtn = banner!.querySelector<HTMLButtonElement>(
      "[data-lgtm-dismiss]",
    );
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();
    expect(root.querySelector("[data-lgtm-banner]")).toBeNull();
  });

  // 6. Test-connection success → success banner
  it("shows success banner on test-connection success", async () => {
    const { root } = await mountView({
      probe: makeProbe(okResult),
    });

    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    expect(testBtn).not.toBeNull();
    testBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    const banner = root.querySelector("[data-lgtm-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-lgtm-banner-kind")).toBe("success");
  });

  // 7. Test-connection bad-credentials → specific copy, no credential bytes
  it("shows 'Credentials rejected' copy on bad-credentials probe error", async () => {
    const { root } = await mountView({
      probe: makeProbe(
        Left.pure<ProbeError>({
          kind: "host-error",
          reason: "bad-credentials",
          message: "auth failed",
        }),
      ),
    });

    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    testBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    const banner = root.querySelector("[data-lgtm-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Credentials rejected by the adapter");
    expect(banner!.getAttribute("data-lgtm-banner-kind")).toBe("error");
  });

  // 8. list-adapters host-not-installed → instructive banner, buttons disabled
  it("shows instructive banner and disables buttons when host not installed", async () => {
    const { root } = await mountView({
      catalogResult: Left.pure<ListAdaptersError>({ kind: "host-not-installed" }),
    });

    const banner = root.querySelector("[data-lgtm-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Native host not installed");

    const saveBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='save']");
    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    expect(saveBtn!.disabled).toBe(true);
    expect(testBtn!.disabled).toBe(true);
  });

  // 9. Security canary: credential value MUST NOT appear in DOM
  it("security canary: form credential value does not appear in rendered DOM text", async () => {
    const CANARY = "SECRET_CANARY_xxx";

    const { root } = await mountView({
      probe: makeProbe(
        Left.pure<ProbeError>({
          kind: "host-error",
          reason: "bad-credentials",
          message: "auth failed",
        }),
      ),
    });

    // Switch to claude-api and fill the apiKey with the canary value
    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    llmSelect!.value = "claude-api";
    llmSelect!.dispatchEvent(new Event("change"));

    const apiKeyInput = root.querySelector<HTMLInputElement>(
      "[data-lgtm-cred-input='apiKey']",
    );
    expect(apiKeyInput).not.toBeNull();
    apiKeyInput!.value = CANARY;

    // Trigger test connection → should yield bad-credentials banner
    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    testBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    // The canary MUST NOT appear in textContent (password input values are not in textContent).
    const bodyInnerText = document.body.textContent ?? "";
    expect(bodyInnerText).not.toContain(CANARY);
    // HTML attributes should not contain the canary (input value is a DOM property, not attribute).
    const bodyHTML = document.body.innerHTML;
    expect(bodyHTML).not.toContain(CANARY);
  });

  // 10. Unknown adapter → warning banner, save still enabled
  it("shows warning for unknown adapter, save still enabled", async () => {
    const catalogWithUnknown: AdapterCatalog = {
      llm: ["super-new-llm"],
      vcs: ["github"],
    };
    const { root } = await mountView({
      catalogResult: Right.pure(catalogWithUnknown),
    });

    // super-new-llm is not in ADAPTER_CREDS_SPECS → unknown adapter warning
    const warning = root.querySelector("[data-lgtm-unknown-adapter]");
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain("Unknown adapter");

    // Save should still be enabled
    const saveBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='save']");
    expect(saveBtn!.disabled).toBe(false);
  });
});
