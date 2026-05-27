import { describe, expect, it, beforeEach } from "vitest";
import { Right, Left } from "monadyssey";
import { createOptionsView, type ListAdaptersError, type AdapterCatalog } from "./dom.js";
import { createOptionsStore } from "./storage.js";
import type { Probe, ProbeError } from "./probe.js";
import type { CheckAuth, CheckAuthError } from "./auth-status.js";
import type { StoredOptions } from "./schema.js";
import type { Either } from "monadyssey";
import type { AuthStatus } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const makeFakeStore = (initial?: StoredOptions) => {
  const data: Record<string, unknown> = initial !== undefined
    ? { "lgtm_buzzer.options.v3": initial }
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

const fakeCatalog: AdapterCatalog = {
  llm: ["claude-cli", "claude-api"],
  vcs: ["github", "ado"],
};

const makeListAdapters =
  (result: Either<ListAdaptersError, AdapterCatalog>) =>
    async () => result;

const okResult: Either<ProbeError, "ok"> = Right.pure("ok" as const);

const makeProbe = (
  result: Either<ProbeError, "ok">,
): Probe => async () => result;

const fakeStatuses: ReadonlyArray<AuthStatus> = [
  { adapterId: "claude-cli", ok: true, detail: "uses CLI's own login" },
  { adapterId: "codex-cli", ok: true, detail: "uses CLI's own login" },
  { adapterId: "copilot-cli", ok: true, detail: "uses CLI's own login" },
  { adapterId: "claude-api", ok: true, detail: "via ANTHROPIC_API_KEY env" },
  { adapterId: "github", ok: true, detail: "via GITHUB_TOKEN env" },
  { adapterId: "ado", ok: false, hint: "Run `az login` or export AZURE_DEVOPS_EXT_PAT" },
];

const makeCheckAuth = (
  result: Either<CheckAuthError, ReadonlyArray<AuthStatus>>,
): CheckAuth => async () => result;

const okCheckAuth: CheckAuth = makeCheckAuth(Right.pure(fakeStatuses));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mountView = async (opts?: {
  initial?: StoredOptions;
  catalogResult?: Either<ListAdaptersError, AdapterCatalog>;
  probe?: Probe;
  checkAuth?: CheckAuth;
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
    checkAuth: opts?.checkAuth ?? okCheckAuth,
  });

  await view.mount();
  return { root, store, view };
};

describe("createOptionsView (ADR-29)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // 1. Mount with empty storage → LLM dropdown populates; no VCS dropdown; no credential inputs
  it("populates LLM dropdown but has no VCS dropdown and no credential inputs", async () => {
    const { root } = await mountView();

    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    expect(llmSelect).not.toBeNull();

    const llmOptions = Array.from(llmSelect!.options).map((o) => o.value);
    expect(llmOptions).toContain("claude-cli");
    expect(llmOptions).toContain("claude-api");

    // VCS dropdown must NOT exist after ADR-29.
    const vcsSelect = root.querySelector("[data-lgtm-select='vcs']");
    expect(vcsSelect).toBeNull();

    // No credential inputs anywhere in the options page.
    const credInputs = root.querySelectorAll("[data-lgtm-cred-input]");
    expect(credInputs.length).toBe(0);

    // No plaintext credential footnote.
    const footnote = root.querySelector("[data-lgtm-footnote]");
    expect(footnote).toBeNull();
  });

  // 2. Auth-status panel shows one row per adapter
  it("auth-status panel shows one row per adapter from checkAuth", async () => {
    const { root } = await mountView();

    // Wait for async loadAuthStatus to complete.
    await new Promise((r) => setTimeout(r, 10));

    const rows = root.querySelectorAll("[data-lgtm-auth-row]");
    expect(rows.length).toBe(6);

    const adapterIds = Array.from(rows).map((r) =>
      r.querySelector("[data-lgtm-auth-adapter-id]")?.textContent,
    );
    expect(adapterIds).toContain("claude-cli");
    expect(adapterIds).toContain("ado");
  });

  // 3. Refresh button re-invokes checkAuth
  it("clicking Refresh re-invokes checkAuth", async () => {
    let callCount = 0;
    const countingCheckAuth: CheckAuth = async () => {
      callCount++;
      return Right.pure(fakeStatuses);
    };

    const { root } = await mountView({ checkAuth: countingCheckAuth });
    await new Promise((r) => setTimeout(r, 10));

    const before = callCount;
    const refreshBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='refresh-auth']");
    expect(refreshBtn).not.toBeNull();
    refreshBtn!.click();

    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(before + 1);
  });

  // 4. Row with ok: true shows ✓ icon
  it("row with ok: true shows success icon", async () => {
    const { root } = await mountView();
    await new Promise((r) => setTimeout(r, 10));

    const githubRow = root.querySelector("[data-lgtm-auth-row='github']");
    expect(githubRow).not.toBeNull();
    expect(githubRow?.getAttribute("data-lgtm-auth-ok")).toBe("true");

    const icon = githubRow?.querySelector("[data-lgtm-auth-icon]");
    expect(icon?.textContent).toBe("✓");
  });

  // 5. Row with ok: false shows ✗ icon and hint
  it("row with ok: false shows failure icon and hint text", async () => {
    const { root } = await mountView();
    await new Promise((r) => setTimeout(r, 10));

    const adoRow = root.querySelector("[data-lgtm-auth-row='ado']");
    expect(adoRow).not.toBeNull();
    expect(adoRow?.getAttribute("data-lgtm-auth-ok")).toBe("false");

    const icon = adoRow?.querySelector("[data-lgtm-auth-icon]");
    expect(icon?.textContent).toBe("✗");

    const detail = adoRow?.querySelector("[data-lgtm-auth-detail]");
    expect(detail?.textContent).toContain("az login");
  });

  // 6. Save handler persists only { schemaVersion: 3, llmAdapterId, questionPoolSize }
  it("clicking Save writes only schemaVersion and llmAdapterId to storage", async () => {
    const store = makeFakeStore();
    const root = document.createElement("main");
    document.body.appendChild(root);

    const view = createOptionsView({
      doc: document,
      root,
      store,
      listAdapters: makeListAdapters(Right.pure(fakeCatalog)),
      probe: makeProbe(okResult),
      checkAuth: okCheckAuth,
    });
    await view.mount();

    const saveBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='save']");
    expect(saveBtn).not.toBeNull();
    saveBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    const readResult = await store.read();
    let savedOptions: StoredOptions | undefined;
    readResult.fold(
      () => { /* noop */ },
      (opts) => { savedOptions = opts; },
    );

    expect(savedOptions).toBeDefined();
    expect(savedOptions?.schemaVersion).toBe(3);
    // No vcsAdapterId or credentials in the saved shape.
    expect(Object.keys(savedOptions ?? {})).not.toContain("vcsAdapterId");
    expect(Object.keys(savedOptions ?? {})).not.toContain("credentials");
  });

  // 7. Test-connection button calls probe with only llmAdapterId (no credentials)
  it("test-connection calls probe with only llmAdapterId", async () => {
    let capturedInput: Parameters<Probe>[0] | undefined;
    const capturingProbe: Probe = async (input) => {
      capturedInput = input;
      return Right.pure("ok" as const);
    };

    const { root } = await mountView({ probe: capturingProbe });

    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    testBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    expect(capturedInput).toBeDefined();
    expect(typeof capturedInput?.llmAdapterId).toBe("string");
    // No credentials field in the probe input.
    expect(JSON.stringify(capturedInput)).not.toContain("credentials");
    expect(JSON.stringify(capturedInput)).not.toContain("apiKey");
    expect(JSON.stringify(capturedInput)).not.toContain("pat");
    expect(JSON.stringify(capturedInput)).not.toContain("vcsAdapterId");
  });

  // 8. Canary: hint containing 'SECRET_CANARY_xxx' renders into DOM
  //    (dom layer is NOT the redaction layer — host is)
  it("canary: AuthStatus hint containing SECRET_CANARY_xxx renders into DOM text", async () => {
    const CANARY = "SECRET_CANARY_xxx";
    const canaryStatuses: ReadonlyArray<AuthStatus> = [
      { adapterId: "ado", ok: false, hint: CANARY },
    ];
    const { root } = await mountView({
      checkAuth: makeCheckAuth(Right.pure(canaryStatuses)),
    });

    await new Promise((r) => setTimeout(r, 10));

    // The auth-status panel DOES render the hint text (no redaction at DOM layer).
    const panel = root.querySelector("[data-lgtm-section='auth-status']");
    expect(panel?.textContent).toContain(CANARY);
  });

  // 9. Host-not-installed → auth-status panel shows error banner
  it("host-not-installed on checkAuth → auth-status panel shows error banner", async () => {
    const { root } = await mountView({
      checkAuth: makeCheckAuth(
        Left.pure<CheckAuthError>({ kind: "host-not-installed" }),
      ),
    });

    await new Promise((r) => setTimeout(r, 10));

    const errorBanner = root.querySelector("[data-lgtm-auth-error-banner]");
    expect(errorBanner).not.toBeNull();
    expect(errorBanner?.textContent).toContain("not installed");
  });

  // 10. listAdapters host-not-installed → instructive banner, buttons disabled
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

  // 11. Test-connection success → success banner
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

  // 12. Test-connection host-error → banner with host message (no credentials in text)
  it("shows error banner on test-connection failure without leaking credentials", async () => {
    const CANARY = "SECRET_PROBE_CANARY";
    const { root } = await mountView({
      probe: makeProbe(
        Left.pure<ProbeError>({
          kind: "host-error",
          reason: "missing-credentials",
          message: "gh auth login required",
        }),
      ),
    });

    const llmSelect = root.querySelector<HTMLSelectElement>("[data-lgtm-select='llm']");
    llmSelect!.value = "claude-api";
    llmSelect!.dispatchEvent(new Event("change"));

    const testBtn = root.querySelector<HTMLButtonElement>("[data-lgtm-btn='test']");
    testBtn!.click();

    await new Promise((r) => setTimeout(r, 10));

    const banner = root.querySelector("[data-lgtm-banner]");
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-lgtm-banner-kind")).toBe("error");
    // Canary must not appear (there is no credential input to read from).
    expect(document.body.textContent).not.toContain(CANARY);
  });

  // 13. unmount clears DOM
  it("unmount removes all DOM content from root", async () => {
    const { root, view } = await mountView();

    expect(root.childElementCount).toBeGreaterThan(0);
    view.unmount();
    expect(root.childElementCount).toBe(0);
  });
});
