import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: ["*://github.com/*", "*://dev.azure.com/*"],
  main() {
    console.log("LGTM-Buzzer content script loaded");
  },
});
