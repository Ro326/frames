export type ExportFormat = 'portrait' | 'landscape' | 'square';
export const EXPORT_FORMATS: Record<ExportFormat, { label: string; width: number; height: number }> = {
  portrait: { label: 'Portrait · 9:16', width: 720, height: 1280 },
  landscape: { label: 'Landscape · 16:9', width: 1280, height: 720 },
  square: { label: 'Square · 1:1', width: 720, height: 720 },
};

// Keep the first browser-only renderer within a reasonable memory budget.
export const MAX_EXPORT_BYTES = 250 * 1024 * 1024;

export function clipEncodingArgs(input: string, output: string, duration: number, hasAudio: boolean, format: ExportFormat): string[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('Invalid shot duration.');
  const { width, height } = EXPORT_FORMATS[format];
  return [
    '-i', input,
    ...(!hasAudio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
    '-map', '0:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0',
    '-t', String(duration),
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`,
    '-af', 'aresample=48000,apad',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', '-y', output,
  ];
}

export function concatArgs(): string[] {
  return ['-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-c', 'copy', '-movflags', '+faststart', '-y', 'finished.mp4'];
}
