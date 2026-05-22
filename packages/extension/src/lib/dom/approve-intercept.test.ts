import { describe, expect, it } from "vitest";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  setupApproveInterceptor,
  type ApproveBlockedEvent,
} from "./approve-intercept.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const githubPR: PRIdentifier = {
  kind: "github",
  owner: "tibtof",
  repo: "lgtm-buzzer",
  number: 42,
};

/**
 * Creates a minimal GitHub-style Approve form with a hidden
 * `pull_request_review[event]` input set to `"approve"`.
 */
function makeApproveForm(doc: Document): HTMLFormElement {
  const form = doc.createElement("form");
  const input = doc.createElement("input");
  input.type = "hidden";
  input.name = "pull_request_review[event]";
  input.value = "approve";
  form.appendChild(input);
  doc.body.appendChild(form);
  return form;
}

/**
 * Creates a form with `pull_request_review[event]` set to a non-approve
 * value (e.g. "comment").
 */
function makeNonApproveForm(doc: Document, eventValue = "comment"): HTMLFormElement {
  const form = doc.createElement("form");
  const input = doc.createElement("input");
  input.type = "hidden";
  input.name = "pull_request_review[event]";
  input.value = eventValue;
  form.appendChild(input);
  doc.body.appendChild(form);
  return form;
}

/**
 * Creates a form without any `pull_request_review[event]` field.
 */
function makeUnrelatedForm(doc: Document): HTMLFormElement {
  const form = doc.createElement("form");
  const input = doc.createElement("input");
  input.type = "text";
  input.name = "search";
  input.value = "hello";
  form.appendChild(input);
  doc.body.appendChild(form);
  return form;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setupApproveInterceptor", () => {
  it("calls onBlocked and prevents default for an Approve form submit", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeApproveForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.form).toBe(form);
    expect(blocked[0]?.pr).toEqual(githubPR);
    expect(submitEvent.defaultPrevented).toBe(true);

    dispose();
    form.remove();
  });

  it("does not call onBlocked for a non-Approve review action", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeNonApproveForm(document, "comment");
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(0);
    expect(submitEvent.defaultPrevented).toBe(false);

    dispose();
    form.remove();
  });

  it("ignores forms unrelated to pull request review", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeUnrelatedForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(0);

    dispose();
    form.remove();
  });

  it("returns early without calling onBlocked when getCurrentPR() is null", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => null,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeApproveForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(0);
    expect(submitEvent.defaultPrevented).toBe(false);

    dispose();
    form.remove();
  });

  it("allows the submit through without preventDefault when shouldBypass() is true", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => true,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeApproveForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(0);
    expect(submitEvent.defaultPrevented).toBe(false);

    dispose();
    form.remove();
  });

  it("capture-phase intercepts before any bubble-phase handler can run", () => {
    // The interceptor is in capture phase on document, so it fires BEFORE any
    // bubble-phase listener on the form or its ancestors. We verify this by
    // recording firing order: capture should run first and set defaultPrevented
    // before any bubble-phase handler is invoked.
    const order: string[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: () => { order.push("capture:onBlocked"); },
    });

    const form = makeApproveForm(document);
    // A bubble-phase handler on document (like GitHub's) should never fire
    // because stopPropagation() is called in the capture phase.
    const bubbleHandler = (): void => { order.push("bubble"); };
    document.addEventListener("submit", bubbleHandler);

    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Capture-phase onBlocked fires; bubble-phase never fires (stopPropagation).
    expect(order).toContain("capture:onBlocked");
    expect(order).not.toContain("bubble");
    expect(submitEvent.defaultPrevented).toBe(true);

    document.removeEventListener("submit", bubbleHandler);
    dispose();
    form.remove();
  });

  it("passes event.submitter through to onBlocked", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const form = makeApproveForm(document);
    const button = document.createElement("button");
    button.type = "submit";
    form.appendChild(button);

    // Dispatch a SubmitEvent with a submitter
    const submitEvent = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: button,
    });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.submitter).toBe(button);

    dispose();
    form.remove();
  });

  it("dispose removes the listener; subsequent submit is not intercepted", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    dispose(); // remove listener immediately

    const form = makeApproveForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(0);

    form.remove();
  });

  it("intercepts a form mounted AFTER setup (document-level listener)", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    // Form is created AFTER the interceptor is set up.
    const form = makeApproveForm(document);
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    expect(blocked).toHaveLength(1);

    dispose();
    form.remove();
  });

  it("does not double-fire for a nested form submit that bubbles", () => {
    const blocked: ApproveBlockedEvent[] = [];
    const dispose = setupApproveInterceptor({
      doc: document,
      getCurrentPR: () => githubPR,
      shouldBypass: () => false,
      onBlocked: (e) => { blocked.push(e); },
    });

    const outerForm = makeApproveForm(document);
    const innerForm = document.createElement("form");
    const innerInput = document.createElement("input");
    innerInput.type = "hidden";
    innerInput.name = "search";
    innerInput.value = "x";
    innerForm.appendChild(innerInput);
    outerForm.appendChild(innerForm);

    // Only the outer Approve form dispatches; inner unrelated form doesn't.
    const outerEvent = new Event("submit", { bubbles: true, cancelable: true });
    outerForm.dispatchEvent(outerEvent);

    // Should only fire once for the outer form.
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.form).toBe(outerForm);

    dispose();
    outerForm.remove();
  });
});

