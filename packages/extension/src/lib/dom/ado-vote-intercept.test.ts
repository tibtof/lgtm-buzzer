import { describe, expect, it, vi, afterEach } from "vitest";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  recognizeAdoVoteClick,
  setupAdoVoteInterceptor,
  KNOWN_ADO_VOTE_TESTIDS,
  type AdoInterceptedApproveEvent,
} from "./ado-vote-intercept.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adoPR: PRIdentifier & { kind: "ado" } = {
  kind: "ado",
  org: "my-org",
  project: "My Project",
  repo: "myrepo",
  pullRequestId: 7,
};

/** Creates a button with a given data-testid attribute. */
const makeButtonWithTestId = (testId: string): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.setAttribute("data-testid", testId);
  document.body.appendChild(btn);
  return btn;
};

/** Creates a button with a given aria-label attribute. */
const makeButtonWithAriaLabel = (label: string): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.setAttribute("aria-label", label);
  document.body.appendChild(btn);
  return btn;
};

/** Creates a button with given text content. */
const makeButtonWithText = (text: string): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.textContent = text;
  document.body.appendChild(btn);
  return btn;
};

/** Creates a span inside a button (ancestor testid). */
const makeSpanInsideButton = (testId: string): { span: HTMLSpanElement; button: HTMLButtonElement } => {
  const btn = document.createElement("button");
  btn.setAttribute("data-testid", testId);
  const span = document.createElement("span");
  span.textContent = "Approve";
  btn.appendChild(span);
  document.body.appendChild(btn);
  return { button: btn, span };
};

// ---------------------------------------------------------------------------
// recognizeAdoVoteClick — unit tests
// ---------------------------------------------------------------------------

describe("recognizeAdoVoteClick", () => {
  afterEach(() => {
    // Clean up all appended elements.
    document.body.innerHTML = "";
  });

  // -------------------------------------------------------------------------
  // Layer 1: data-testid
  // -------------------------------------------------------------------------

  it("returns match for each KNOWN_ADO_VOTE_TESTIDS value", () => {
    for (const testId of KNOWN_ADO_VOTE_TESTIDS) {
      const btn = makeButtonWithTestId(testId);
      const result = recognizeAdoVoteClick(btn);
      expect(result, `Expected match for testId=${testId}`).not.toBeNull();
      expect(result?.element).toBe(btn);
      btn.remove();
    }
  });

  it("returns match when target is a span inside a button with data-testid (ancestor match)", () => {
    const { span, button } = makeSpanInsideButton(KNOWN_ADO_VOTE_TESTIDS[0] ?? "complete-vote-button");
    const result = recognizeAdoVoteClick(span);
    expect(result).not.toBeNull();
    expect(result?.element).toBe(button);
  });

  it("returns approve variant for a plain approve testid", () => {
    const btn = makeButtonWithTestId(KNOWN_ADO_VOTE_TESTIDS[0] ?? "complete-vote-button");
    const result = recognizeAdoVoteClick(btn);
    expect(result?.variant).toBe("approve");
  });

  it("returns approve-with-suggestions variant for testid containing 'suggestion'", () => {
    const btn = makeButtonWithTestId("pr-vote-suggestion");
    const result = recognizeAdoVoteClick(btn, { testIds: ["pr-vote-suggestion"] });
    expect(result?.variant).toBe("approve-with-suggestions");
  });

  it("matches custom override testId alongside built-in KNOWN_ADO_VOTE_TESTIDS", () => {
    const btn = makeButtonWithTestId("custom-approve");
    const result = recognizeAdoVoteClick(btn, { testIds: ["custom-approve"] });
    expect(result).not.toBeNull();
    expect(result?.element).toBe(btn);
  });

  it("returns null for unknown data-testid (not in KNOWN or overrides)", () => {
    const btn = makeButtonWithTestId("unrelated-button");
    const result = recognizeAdoVoteClick(btn);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Layer 2: aria-label
  // -------------------------------------------------------------------------

  it('returns match for aria-label "Approve"', () => {
    const btn = makeButtonWithAriaLabel("Approve");
    const result = recognizeAdoVoteClick(btn);
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("approve");
    expect(result?.element).toBe(btn);
  });

  it('returns approve-with-suggestions variant for aria-label "Approve with suggestions"', () => {
    const btn = makeButtonWithAriaLabel("Approve with suggestions");
    const result = recognizeAdoVoteClick(btn);
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("approve-with-suggestions");
  });

  it('returns null for aria-label "Reject"', () => {
    const btn = makeButtonWithAriaLabel("Reject");
    const result = recognizeAdoVoteClick(btn);
    expect(result).toBeNull();
  });

  it('returns null for aria-label "Wait for author"', () => {
    const btn = makeButtonWithAriaLabel("Wait for author");
    const result = recognizeAdoVoteClick(btn);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Layer 3: textContent
  // -------------------------------------------------------------------------

  it('returns match for textContent "Approve"', () => {
    const btn = makeButtonWithText("Approve");
    const result = recognizeAdoVoteClick(btn);
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("approve");
  });

  it('returns match for textContent "approve " (trailing whitespace — trimmed)', () => {
    const btn = makeButtonWithText("approve ");
    const result = recognizeAdoVoteClick(btn);
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("approve");
  });

  it('returns match for textContent "Approve with suggestions"', () => {
    const btn = makeButtonWithText("Approve with suggestions");
    const result = recognizeAdoVoteClick(btn);
    expect(result).not.toBeNull();
    expect(result?.variant).toBe("approve-with-suggestions");
  });

  it('returns null for non-English textContent "Approuver"', () => {
    const btn = makeButtonWithText("Approuver");
    const result = recognizeAdoVoteClick(btn);
    expect(result).toBeNull();
  });

  it("returns null for a non-Element target", () => {
    const result = recognizeAdoVoteClick(null);
    expect(result).toBeNull();
  });

  it("returns null for a text node target", () => {
    const textNode = document.createTextNode("Approve");
    const result = recognizeAdoVoteClick(textNode);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setupAdoVoteInterceptor — integration tests
// ---------------------------------------------------------------------------

describe("setupAdoVoteInterceptor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fires onBlocked with variant and element when Approve button is clicked", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];

    const btn = makeButtonWithAriaLabel("Approve");

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => adoPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.kind).toBe("ado");
    expect(blocked[0]?.variant).toBe("approve");
    expect(blocked[0]?.element).toBe(btn);
    expect(blocked[0]?.pr).toEqual(adoPR);
    expect(clickEvent.defaultPrevented).toBe(true);

    dispose();
  });

  it("does NOT fire onBlocked when getCurrentPR() is null", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];
    const btn = makeButtonWithAriaLabel("Approve");

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => null,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(0);
    expect(clickEvent.defaultPrevented).toBe(false);

    dispose();
  });

  it("does NOT fire onBlocked when getCurrentPR().kind is 'github'", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];
    const btn = makeButtonWithAriaLabel("Approve");

    const githubPR: PRIdentifier = {
      kind: "github",
      owner: "tibtof",
      repo: "lgtm-buzzer",
      number: 1,
    };

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(0);
    expect(clickEvent.defaultPrevented).toBe(false);

    dispose();
  });

  it("allows click through without calling onBlocked when shouldBypass() is true", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];
    const btn = makeButtonWithAriaLabel("Approve");

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => adoPR,
      shouldBypass: () => true,
      onBlocked: (e) => { blocked.push(e); },
    });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(0);
    expect(clickEvent.defaultPrevented).toBe(false);

    dispose();
  });

  it("dispose removes the listener; subsequent click is not intercepted", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];
    const btn = makeButtonWithAriaLabel("Approve");

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => adoPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    dispose(); // remove listener immediately

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(0);
  });

  it("calls stopImmediatePropagation on intercept", () => {
    const btn = makeButtonWithAriaLabel("Approve");
    const secondListenerOrder: string[] = [];

    // A second capture-phase listener that should NOT run after ours.
    const secondHandler = (): void => { secondListenerOrder.push("second"); };
    document.addEventListener("click", secondHandler, { capture: true });

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => adoPR,
      shouldBypass: () => false,
      onBlocked: () => { secondListenerOrder.push("interceptor"); },
    });

    // The interceptor must be added before the secondHandler for
    // stopImmediatePropagation to block secondHandler. In practice the
    // order above ensures this since we add our listener first.
    // But to guarantee ordering in this test, remove the second handler
    // and re-add AFTER our interceptor is attached.
    document.removeEventListener("click", secondHandler, { capture: true });

    const secondHandlerAfter = (): void => { secondListenerOrder.push("second-after"); };
    document.addEventListener("click", secondHandlerAfter, { capture: true });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(secondListenerOrder).toContain("interceptor");
    expect(secondListenerOrder).not.toContain("second-after");

    document.removeEventListener("click", secondHandlerAfter, { capture: true });
    dispose();
  });

  it("override testIds: custom testId triggers intercept", () => {
    const blocked: AdoInterceptedApproveEvent[] = [];
    const btn = makeButtonWithTestId("my-custom-approve");

    const dispose = setupAdoVoteInterceptor({
      doc: document,
      getCurrentPR: () => adoPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
      overrides: { testIds: ["my-custom-approve"] },
    });

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(blocked).toHaveLength(1);
    dispose();
  });

  // Verify the spy function is accessible via vi.
  it("uses vi correctly in interceptor tests", () => {
    // This verifies vi.fn() and vi.spyOn() are importable and callable.
    const mock = vi.fn();
    mock("test");
    expect(mock).toHaveBeenCalledWith("test");
  });
});
