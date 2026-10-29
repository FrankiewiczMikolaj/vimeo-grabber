export class NativeSaveError extends Error {
  readonly category: 'cancelled' | 'disk-full' | 'filesystem';

  constructor(code?: string) {
    const category = code === 'USER_CANCELED' ? 'cancelled' : code === 'FILE_NO_SPACE' ? 'disk-full' : 'filesystem';
    // Chromium codes are public constants, not arbitrary messages or signed URLs.
    const safeCode = code && /^[A-Z_]+$/.test(code) ? code : 'interrupted';
    super(category === 'cancelled' ? 'Save cancelled' : category === 'disk-full' ? 'Native disk full' : `Native download ${safeCode}`);
    this.category = category;
  }
}
