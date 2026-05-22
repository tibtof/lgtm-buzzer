import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createGitHubNavigationWatcher,
  createAdoNavigationWatcher,
} from "./navigation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal document-like fake that tracks event listener operations.
 * Used to avoid polluting the real jsdom document with event listeners in
 * tests that don't need DOM interactions.
 */
const makeDocFake = (): Document & {
  fire: (name: string) => void;
} => {
  const listeners = new Map<string, Set<EventListener>>();
  const doc = {
    addEventListener: (name: string, handler: EventListener): void => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(handler);
    },
    removeEventListener: (name: string, handler: EventListener): void => {
      listeners.get(name)?.delete(handler);
    },
    fire: (name: string): void => {
      for (const handler of listeners.get(name) ?? []) {
        handler(new Event(name));
      }
    },
    body: document.body,
    defaultView: window,
  } as unknown as Document & { fire: (name: string) => void };
  return doc;
};

// ---------------------------------------------------------------------------
// createGitHubNavigationWatcher
// ---------------------------------------------------------------------------

describe("createGitHubNavigationWatcher", () => {
  it("fires onWillNavigate on turbo:before-visit", () => {
    const doc = makeDocFake();
    const watcher = createGitHubNavigationWatcher(doc);

    const willNavigateCalls: number[] = [];
    const didNavigateCalls: number[] = [];

    const dispose = watcher.start({
      onWillNavigate: () => { willNavigateCalls.push(1); },
      onDidNavigate: () => { didNavigateCalls.push(1); },
    });

    doc.fire("turbo:before-visit");

    expect(willNavigateCalls).toHaveLength(1);
    expect(didNavigateCalls).toHaveLength(0);

    dispose();
  });

  it("fires onDidNavigate on turbo:render", () => {
    const doc = makeDocFake();
    const watcher = createGitHubNavigationWatcher(doc);

    const willNavigateCalls: number[] = [];
    const didNavigateCalls: number[] = [];

    const dispose = watcher.start({
      onWillNavigate: () => { willNavigateCalls.push(1); },
      onDidNavigate: () => { didNavigateCalls.push(1); },
    });

    doc.fire("turbo:render");

    expect(willNavigateCalls).toHaveLength(0);
    expect(didNavigateCalls).toHaveLength(1);

    dispose();
  });

  it("dispose removes both turbo listeners", () => {
    const doc = makeDocFake();
    const watcher = createGitHubNavigationWatcher(doc);

    const calls: string[] = [];
    const dispose = watcher.start({
      onWillNavigate: () => { calls.push("will"); },
      onDidNavigate: () => { calls.push("did"); },
    });

    dispose();

    doc.fire("turbo:before-visit");
    doc.fire("turbo:render");

    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createAdoNavigationWatcher
// ---------------------------------------------------------------------------

describe("createAdoNavigationWatcher", () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://dev.azure.com/org/proj/_git/repo/pullrequest/1" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: originalHref },
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("fires both onWillNavigate and onDidNavigate on popstate with URL change", () => {
    const watcher = createAdoNavigationWatcher(document);

    const willCalls: number[] = [];
    const didCalls: number[] = [];

    const dispose = watcher.start({
      onWillNavigate: () => { willCalls.push(1); },
      onDidNavigate: () => { didCalls.push(1); },
    });

    // Change the URL then fire popstate.
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2" },
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(willCalls).toHaveLength(1);
    expect(didCalls).toHaveLength(1);

    dispose();
  });

  it("does NOT fire callbacks on popstate when URL is unchanged", () => {
    const watcher = createAdoNavigationWatcher(document);

    const calls: string[] = [];
    const dispose = watcher.start({
      onWillNavigate: () => { calls.push("will"); },
      onDidNavigate: () => { calls.push("did"); },
    });

    // Do NOT change the URL — same href as set in beforeEach.
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(calls).toHaveLength(0);

    dispose();
  });

  it("fires callbacks on MutationObserver body change with URL change", async () => {
    const watcher = createAdoNavigationWatcher(document);

    const willCalls: number[] = [];
    const didCalls: number[] = [];

    const dispose = watcher.start({
      onWillNavigate: () => { willCalls.push(1); },
      onDidNavigate: () => { didCalls.push(1); },
    });

    // Change the URL then trigger a body mutation (simulates pushState nav).
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://dev.azure.com/org/proj/_git/repo/pullrequest/3" },
      writable: true,
      configurable: true,
    });

    // Add a child to body to trigger MutationObserver.
    const div = document.createElement("div");
    document.body.appendChild(div);

    // Wait for MutationObserver to fire (it's async).
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(willCalls.length).toBeGreaterThan(0);
    expect(didCalls.length).toBeGreaterThan(0);

    div.remove();
    dispose();
  });

  it("does NOT fire callbacks on MutationObserver body change without URL change", async () => {
    const watcher = createAdoNavigationWatcher(document);

    const calls: string[] = [];
    const dispose = watcher.start({
      onWillNavigate: () => { calls.push("will"); },
      onDidNavigate: () => { calls.push("did"); },
    });

    // Do NOT change the URL — trigger a body mutation only.
    const div = document.createElement("div");
    document.body.appendChild(div);

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(calls).toHaveLength(0);

    div.remove();
    dispose();
  });

  it("dispose disconnects MutationObserver and removes popstate listener", async () => {
    const watcher = createAdoNavigationWatcher(document);

    const calls: string[] = [];
    const dispose = watcher.start({
      onWillNavigate: () => { calls.push("will"); },
      onDidNavigate: () => { calls.push("did"); },
    });

    dispose();

    // Change URL and trigger both popstate and body mutation.
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://dev.azure.com/org/proj/_git/repo/pullrequest/99" },
      writable: true,
      configurable: true,
    });

    window.dispatchEvent(new PopStateEvent("popstate"));

    const div = document.createElement("div");
    document.body.appendChild(div);
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    expect(calls).toHaveLength(0);

    div.remove();
  });
});
