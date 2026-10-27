import './popup.css';
import type { DetectedStream } from './detect';
import { downloadStream } from './download';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const streams = document.querySelector<HTMLElement>('#streams')!;

async function loadStreams() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab');
    const detected: DetectedStream[] = await chrome.tabs.sendMessage(
      tab.id, 'detect-synthetic-streams', { frameId: 0 },
    );
    if (detected.length === 0) {
      status.textContent = 'No synthetic fixture stream found on this page.';
      return;
    }
    status.textContent = 'Synthetic plain-text fixture only. Not a real Vimeo video.';
    const stream = detected[0];
    const title = document.createElement('h2');
    title.textContent = stream.title;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Download synthetic file';
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'Requesting download…';
      try {
        await downloadStream(stream);
        status.textContent = 'Download started. Check Chromium Downloads for completion.';
      } catch {
        status.textContent = 'Download could not start. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
    streams.append(title, button);
  } catch {
    status.textContent = 'Cannot inspect this page. Open a supported Vimeo page and reload it, then reopen the popup.';
  }
}

void loadStreams();
