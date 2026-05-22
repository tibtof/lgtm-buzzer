/**
 * Keyboard focus trap for the quiz modal.
 *
 * Confines Tab / Shift+Tab to the focusable descendants of a container.
 * Used to keep keyboard navigation inside the modal panel while it is open,
 * satisfying WCAG 2.1 SC 2.1.2 (No Keyboard Trap) by providing a well-defined
 * exit (Esc key handled separately by the modal).
 *
 * Activation:
 * - Records `previouslyFocused = doc.activeElement`.
 * - Attaches a `keydown` listener that intercepts Tab / Shift+Tab.
 * - Focuses the first focusable element inside `container`.
 *
 * Deactivation:
 * - Detaches the listener.
 * - Restores focus to `previouslyFocused` if it is still in the DOM.
 *
 * Focusable selector covers:
 *   `a[href]`, `button:not([disabled])`, `input:not([disabled])`,
 *   `select:not([disabled])`, `textarea:not([disabled])`,
 *   `[tabindex]:not([tabindex="-1"])`.
 *
 * Shadow-DOM-aware: the `container` can be a `ShadowRoot` or an `HTMLElement`.
 * The selector runs against `container.querySelectorAll(...)`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A focus trap that confines Tab / Shift+Tab within a container. */
export type FocusTrap = {
  /** Attach the trap and move focus into the container. */
  readonly activate: () => void;
  /** Detach the trap and restore focus. Idempotent. */
  readonly deactivate: () => void;
};

/** Dependencies injected into `createFocusTrap`. */
export type FocusTrapDeps = {
  /** The document that owns the container (used for `activeElement` and key listeners). */
  readonly doc: Document;
  /**
   * The container whose focusable descendants are trapped.
   *
   * May be a `ShadowRoot` (the modal shadow root) or a plain `HTMLElement`.
   */
  readonly container: HTMLElement | ShadowRoot;
};

// ---------------------------------------------------------------------------
// Focusable selector
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Returns an ordered list of focusable elements within `container`.
 */
const getFocusable = (container: HTMLElement | ShadowRoot): readonly HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a focus trap that keeps Tab / Shift+Tab within `deps.container`.
 *
 * The trap is inactive until `activate()` is called. It can be toggled
 * repeatedly (activate / deactivate / activate …) without leaking listeners.
 *
 * @param deps - `doc` and `container`.
 * @returns A `FocusTrap` with `activate` and `deactivate` methods.
 */
export const createFocusTrap = (deps: FocusTrapDeps): FocusTrap => {
  const { doc, container } = deps;

  let previouslyFocused: Element | null = null;
  let active = false;

  const handleKeyDown = (event: Event): void => {
    const ke = event as KeyboardEvent;
    if (ke.key !== "Tab") return;

    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      ke.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (ke.shiftKey) {
      // Shift+Tab: wrap from first to last.
      if (doc.activeElement === first || container.querySelector(":focus") === first) {
        ke.preventDefault();
        last?.focus();
      }
    } else {
      // Tab: wrap from last to first.
      if (doc.activeElement === last || container.querySelector(":focus") === last) {
        ke.preventDefault();
        first?.focus();
      }
    }
  };

  return {
    activate: (): void => {
      if (active) return;
      active = true;

      // Record the element that had focus before the modal opened.
      previouslyFocused = doc.activeElement;

      const focusable = getFocusable(container);
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        // Fallback: focus the container itself (must have tabindex="-1").
        if (container instanceof HTMLElement) {
          container.focus();
        }
      }

      doc.addEventListener("keydown", handleKeyDown, true);
    },

    deactivate: (): void => {
      if (!active) return;
      active = false;

      doc.removeEventListener("keydown", handleKeyDown, true);

      // Restore focus to the previously-focused element if it is still in the DOM.
      if (
        previouslyFocused instanceof HTMLElement &&
        doc.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
      previouslyFocused = null;
    },
  };
};
