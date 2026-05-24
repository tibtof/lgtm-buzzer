import { browser } from "wxt/browser";
import { detectPRPage } from "../../src/lib/dom/page-detection.js";

/**
 * Toolbar popup entrypoint.
 *
 * Reads the active tab's URL, shows a "Quiz me on this PR" button when the
 * URL is a PR page, and forwards the click to the content script via
 * `browser.tabs.sendMessage`.
 *
 * Vanilla TS + DOM, no framework, ~80 LOC. The popup HTML is rendered server-
 * side via the static index.html template; this script populates the root.
 */
const renderPRDetected = (
  root: HTMLElement,
  description: string,
  onQuiz: () => void,
): void => {
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "LGTM-Buzzer";
  root.appendChild(title);

  const pr = document.createElement("div");
  pr.className = "pr";
  pr.textContent = description;
  root.appendChild(pr);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Quiz me on this PR";
  btn.setAttribute("data-testid", "lgtm-buzzer-popup-quiz");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Opening quiz…";
    onQuiz();
    // Close the popup so focus returns to the underlying page where the
    // modal will appear. A tiny delay lets the message dispatch first.
    setTimeout(() => window.close(), 200);
  });
  root.appendChild(btn);

  const optionsLink = document.createElement("a");
  optionsLink.className = "options-link";
  optionsLink.textContent = "Options";
  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage().catch(() => undefined);
  });
  root.appendChild(optionsLink);
};

const renderEmptyState = (root: HTMLElement, url: string): void => {
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "LGTM-Buzzer";
  root.appendChild(title);

  const msg = document.createElement("p");
  msg.className = "empty";
  msg.textContent =
    "Open a GitHub or Azure DevOps pull request to take a quiz, or use the floating button on the PR page itself.";
  root.appendChild(msg);

  // Debug aid only — tiny, faint, last line.
  if (url !== "") {
    const u = document.createElement("p");
    u.className = "empty";
    u.style.fontSize = "11px";
    u.style.opacity = "0.7";
    u.textContent = `Current tab: ${url.length > 80 ? url.slice(0, 77) + "…" : url}`;
    root.appendChild(u);
  }

  const optionsLink = document.createElement("a");
  optionsLink.className = "options-link";
  optionsLink.textContent = "Options";
  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage().catch(() => undefined);
  });
  root.appendChild(optionsLink);
};

const describePR = (pr: ReturnType<typeof detectPRPage>): string => {
  if (!pr.ok) return "";
  return pr.pr.kind === "github"
    ? `${pr.pr.owner}/${pr.pr.repo} #${pr.pr.number}`
    : `${pr.pr.org}/${pr.pr.project}/${pr.pr.repo} !${pr.pr.pullRequestId}`;
};

const main = async (): Promise<void> => {
  const root = document.getElementById("popup-root");
  if (root === null) {
    throw new Error("[lgtm-buzzer:popup] #popup-root not found");
  }

  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const url = activeTab?.url ?? "";
  const tabId = activeTab?.id;
  const detection = detectPRPage(url);

  if (!detection.ok || tabId === undefined) {
    renderEmptyState(root, url);
    return;
  }

  renderPRDetected(root, describePR(detection), () => {
    void browser.tabs
      .sendMessage(tabId, { kind: "trigger-manual-quiz" })
      .catch(() => undefined);
  });
};

void main();
