import type { DetectedStream } from './detect';

export async function downloadStream(stream: DetectedStream): Promise<number> {
  return chrome.downloads.download({
    url: stream.downloadUrl,
    filename: 'vimeo-grabber-synthetic.txt',
    conflictAction: 'overwrite',
    saveAs: false,
  });
}
