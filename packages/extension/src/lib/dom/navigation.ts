/**
 * Platform-agnostic navigation watcher abstraction.
 *
 * The quiz-flow controller needs to react to SPA navigations on both GitHub
 * (Hotwire Turbo) and Azure DevOps (history.pushState / popstate). Rather than
 * hard-coding Turbo event names in the controller, we inject a `NavigationWatcher`
 * at construction time. Each platform factory wires the appropriate events.
 *
 * Dependency direction: this file has zero platform-specific deps — it only
 * touches DOM APIs that are available in any browser context.
 */

/**
 * A navigation watcher that notifies the controller of SPA navigations.
 *
 * `start` registers the platform-specific event listeners and returns a
 * dispose function that removes them. The callbacks are:
 *
 * - `onWillNavigate` — fires just before the URL changes (best-effort; ADO
 *   collapses this into `onDidNavigate` because `history.pushState` provides
 *   no pre-navigation hook).
 * - `onDidNavigate` — fires after the URL has changed.
 */
export type NavigationWatcher = {
  readonly start: (cb: {
    readonly onWillNavigate: () => void;
    readonly onDidNavigate: () => void;
  }) => () => void;
};

/**
 * Creates a `NavigationWatcher` for GitHub pages that uses Hotwire Turbo events.
 *
 * - `turbo:before-visit` → `onWillNavigate`
 * - `turbo:render` → `onDidNavigate`
 *
 * @param doc - The document to attach listeners to.
 */
export const createGitHubNavigationWatcher = (doc: Document): NavigationWatcher => ({
  start: (cb) => {
    const beforeVisitHandler = (): void => { cb.onWillNavigate(); };
    const renderHandler = (): void => { cb.onDidNavigate(); };

    doc.addEventListener("turbo:before-visit", beforeVisitHandler);
    doc.addEventListener("turbo:render", renderHandler);

    return () => {
      doc.removeEventListener("turbo:before-visit", beforeVisitHandler);
      doc.removeEventListener("turbo:render", renderHandler);
    };
  },
});

/**
 * Creates a `NavigationWatcher` for Azure DevOps pages that uses `popstate`
 * events and a `MutationObserver` URL poll.
 *
 * ADO does NOT use Hotwire Turbo. Its SPA navigation is history.pushState-based.
 * Patching `history.pushState` from a content-script isolated world only affects
 * the CS's own world — it never fires for real ADO navigations. Instead, we use:
 *
 * - `window.addEventListener("popstate", ...)` for back/forward navigation.
 * - `MutationObserver` on `document.body` (`childList: true, subtree: false`)
 *   that compares `window.location.href` to the last seen value after each DOM
 *   mutation. This catches `pushState` navigations which fire no standard event.
 *
 * Because ADO provides no pre-navigation hook, `onWillNavigate` is called
 * synchronously inside `onDidNavigate` (the two are collapsed into one moment).
 * The controller drops pending state and re-detects the PR at the same time.
 *
 * @param doc - The document to attach listeners and observer to.
 */
export const createAdoNavigationWatcher = (doc: Document): NavigationWatcher => ({
  start: (cb) => {
    let lastHref = doc.defaultView?.location.href ?? "";

    const fireNavigate = (): void => {
      cb.onWillNavigate();
      cb.onDidNavigate();
    };

    const popstateHandler = (): void => {
      const current = doc.defaultView?.location.href ?? "";
      if (current !== lastHref) {
        lastHref = current;
        fireNavigate();
      }
    };

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        const current = doc.defaultView?.location.href ?? "";
        if (current !== lastHref) {
          lastHref = current;
          fireNavigate();
        }
      });
      if (doc.body) {
        observer.observe(doc.body, { childList: true, subtree: false });
      }
    }

    doc.defaultView?.addEventListener("popstate", popstateHandler);

    return () => {
      doc.defaultView?.removeEventListener("popstate", popstateHandler);
      observer?.disconnect();
      observer = null;
    };
  },
});
