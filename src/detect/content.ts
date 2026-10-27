import { detectStreams } from './index';

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && message === 'detect-synthetic-streams') {
    respond(detectStreams(document));
  }
});
