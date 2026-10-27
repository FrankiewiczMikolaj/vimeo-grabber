# Outcome

Mikołaj merged the action-popup harness in PR #15 as `6770a3c`. Headed Chromium invokes chrome.action.openPopup, verifies a distinct real popup view, captures its rendered pixels, and observes destruction after focus changes. Local headless/headed and negative-popup probes passed with browser/profile cleanup, and both required PR checks passed. This is not a physical click or keyboard activation and does not prove an activeTab permission grant.
