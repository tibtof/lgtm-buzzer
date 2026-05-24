import { detectPRPage } from "./page-detection.js";

/**
 * Injects a floating "Quiz me on this PR" button into PR pages.
 *
 * The button:
 * - Is rendered in a shadow-DOM host so site CSS cannot deform it.
 * - Sits fixed bottom-right, low-profile.
 * - Only appears when `detectPRPage(location.href).ok` is true at insert time
 *   AND continues to re-evaluate on SPA navigations (caller passes a
 *   `onNavigationChanged` subscription, mirroring quiz-flow's strategy).
 * - Click → invokes the injected `onClick` callback (in production this calls
 *   `quizFlowController.triggerManual()`).
 *
 * Dependency-injected so tests can verify behaviour without a real document
 * or a real quiz flow.
 */
export type ManualTriggerButtonDeps = {
  readonly doc: Document;
  readonly onClick: () => void;
  /**
   * Subscribes to URL changes. Returns a disposer. Production wires this to
   * the same `NavigationWatcher` used by quiz-flow so we only re-render when
   * the host actually navigates (not on every history.pushState noise).
   */
  readonly subscribeNavigation: (cb: () => void) => () => void;
};

export type ManualTriggerButton = {
  readonly mount: () => void;
  readonly unmount: () => void;
};

const HOST_ID = "lgtm-buzzer-manual-trigger";
const BUTTON_TESTID = "lgtm-buzzer-manual-quiz-btn";

export const createManualTriggerButton = (
  deps: ManualTriggerButtonDeps,
): ManualTriggerButton => {
  const { doc, onClick, subscribeNavigation } = deps;

  let hostEl: HTMLDivElement | null = null;
  let disposeNav: (() => void) | null = null;

  const renderForCurrentUrl = (): void => {
    const url = doc.defaultView?.location.href ?? "";
    const result = detectPRPage(url);

    if (!result.ok) {
      removeHostIfPresent();
      return;
    }

    if (hostEl !== null) return; // already mounted for this PR page
    insertHost();
  };

  const removeHostIfPresent = (): void => {
    if (hostEl !== null) {
      hostEl.remove();
      hostEl = null;
    }
  };

  const insertHost = (): void => {
    hostEl = doc.createElement("div");
    hostEl.id = HOST_ID;
    // Shadow DOM isolates the button's styles from the host page (GitHub /
    // ADO have aggressive global CSS).
    const shadow = hostEl.attachShadow({ mode: "open" });

    const style = doc.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .wrap {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .btn {
        background: #1f6feb;
        color: #ffffff;
        border: 1px solid #1158c7;
        border-radius: 6px;
        padding: 8px 14px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        font-weight: 600;
      }
      .btn:hover { background: #1158c7; }
      .btn:focus-visible { outline: 2px solid #0a4cb0; outline-offset: 2px; }
      @media (prefers-color-scheme: dark) {
        .btn { border-color: #0e4caa; }
      }
    `;
    shadow.appendChild(style);

    const wrap = doc.createElement("div");
    wrap.className = "wrap";

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.setAttribute("data-testid", BUTTON_TESTID);
    btn.title = "Open the LGTM-Buzzer quiz for this PR";
    btn.textContent = "Quiz me on this PR";
    btn.addEventListener("click", () => {
      onClick();
    });

    wrap.appendChild(btn);
    shadow.appendChild(wrap);
    doc.body.appendChild(hostEl);
  };

  return {
    mount: (): void => {
      renderForCurrentUrl();
      disposeNav = subscribeNavigation(renderForCurrentUrl);
    },
    unmount: (): void => {
      removeHostIfPresent();
      if (disposeNav !== null) {
        disposeNav();
        disposeNav = null;
      }
    },
  };
};
