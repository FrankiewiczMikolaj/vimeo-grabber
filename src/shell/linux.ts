const quote = (path: string) => `'${path.replaceAll("'", "'\"'\"'")}'`;

export function mergeCommand(video: string, audio: string, outputName: string): string {
  if (![video, audio].every(path => path.startsWith('/') && !path.includes('\0')) ||
    !outputName || /[/\0]/.test(outputName)) throw new Error('Absolute native paths required');
  const output = video.slice(0, video.lastIndexOf('/') + 1) + outputName;
  return `ffmpeg -n -i ${quote(video)} -i ${quote(audio)} -map 0:v:0 -map 1:a:0 -c copy ${quote(output)}`;
}
