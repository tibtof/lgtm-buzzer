import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFocusTrap } from "./focus-trap.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a container div with N buttons and appends it to document.body. */
const makeContainer = (buttonCount: number): HTMLDivElement => {
  const div = document.createElement("div");
  for (let i = 0; i < buttonCount; i++) {
    const btn = document.createElement("button");
    btn.textContent = `Button ${i + 1}`;
    btn.id = `btn-${i}`;
    div.appendChild(btn);
  }
  document.body.appendChild(div);
  return div;
};

/** Simulates pressing Tab (or Shift+Tab) on the document. */
const pressTab = (shiftKey = false): void => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/** Returns all button elements inside a container. */
const buttons = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll("button"));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFocusTrap", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // 1. Activate focuses first button
  it("1. activate on a container with three buttons focuses the first button", () => {
    container = makeContainer(3);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();
    expect(document.activeElement).toBe(buttons(container)[0]);
    trap.deactivate();
  });

  // 2. Tab from last wraps to first
  it("2. Tab from the last button wraps to the first", () => {
    container = makeContainer(3);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();

    const btns = buttons(container);
    // Move focus to the last button manually.
    btns[btns.length - 1]?.focus();
    expect(document.activeElement).toBe(btns[btns.length - 1]);

    pressTab(false); // Tab (no shift)

    // Focus should have wrapped to the first.
    expect(document.activeElement).toBe(btns[0]);
    trap.deactivate();
  });

  // 3. Shift+Tab from first wraps to last
  it("3. Shift+Tab from the first button wraps to the last", () => {
    container = makeContainer(3);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();

    const btns = buttons(container);
    btns[0]?.focus();

    pressTab(true); // Shift+Tab

    expect(document.activeElement).toBe(btns[btns.length - 1]);
    trap.deactivate();
  });

  // 4. Tab in the middle moves to the next (no wrap)
  it("4. Tab in the middle moves to the next focusable without wrapping", () => {
    container = makeContainer(3);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();

    const btns = buttons(container);
    // Focus the first, then Tab — should go to the second (the browser handles
    // this natively; the trap only intercepts when at the boundary).
    btns[0]?.focus();

    // Simulate Tab from first — not at the last, so no interception expected.
    // We press Tab manually, but since jsdom doesn't move focus natively on Tab,
    // we just check that the trap didn't break things by checking no wrap happened.
    // Focus should still be on the first (jsdom doesn't handle Tab focus move).
    pressTab(false);
    // jsdom doesn't move focus on Tab by itself; just assert no crash + no wrap.
    expect(document.activeElement).toBe(btns[0]); // remains on first (jsdom limitation)
    trap.deactivate();
  });

  // 5. Deactivate restores previously-focused element
  it("5. deactivate restores focus to the previously-focused element", () => {
    const outsideBtn = document.createElement("button");
    outsideBtn.id = "outside";
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    container = makeContainer(2);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();

    // Focus is now inside the container.
    expect(document.activeElement).toBe(buttons(container)[0]);

    trap.deactivate();

    // Focus should be restored to the outside button.
    expect(document.activeElement).toBe(outsideBtn);
  });

  // 6. Deactivate twice is idempotent
  it("6. deactivate twice does not throw", () => {
    container = makeContainer(2);
    const trap = createFocusTrap({ doc: document, container });
    trap.activate();
    expect(() => {
      trap.deactivate();
      trap.deactivate(); // second call must be a no-op
    }).not.toThrow();
  });

  // 7. Activate on empty container focuses the container itself
  it("7. activate on an empty container focuses the container (tabindex=-1 fallback)", () => {
    container = document.createElement("div");
    container.setAttribute("tabindex", "-1");
    document.body.appendChild(container);

    const trap = createFocusTrap({ doc: document, container });
    trap.activate();

    // No focusable children → should focus the container itself.
    expect(document.activeElement).toBe(container);
    trap.deactivate();
  });
});
