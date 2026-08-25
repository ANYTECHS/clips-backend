import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
export interface VideoMetadata { duration: number; width: number; height: number; format: string; fps: number; bitrate: number; resolution: string }
export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath]);
  const probe = JSON.parse(stdout) as any;
  const vs = (probe.streams ?? []).find((s: any) => s.codec_type === 'video') ?? {};
  const fmt = probe.format ?? {};
  const duration = parseFloat(vs.duration ?? fmt.duration ?? '0') || 0;
  const width = vs.width ?? 0; const height = vs.height ?? 0;
  const [num, den] = (vs.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
  const bitrate = parseInt(vs.bit_rate ?? fmt.bit_rate ?? '0', 10) || 0;
  const format = (fmt.format_name ?? '').split(',')[0] ?? '';
  return { duration, width, height, resolution: `${width}x${height}`, format, fps, bitrate };
}
export interface CutClipOptions { inputPath: string; outputPath: string; startTime: number; endTime: number; videoDuration?: number }
export async function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, startTime } = options;
  const endTime = options.videoDuration ? Math.min(options.endTime, options.videoDuration) : options.endTime;
  await execFileAsync('ffmpeg', ['-y', '-ss', String(startTime), '-to', String(endTime), '-i', inputPath, '-c', 'copy', outputPath]);
  return outputPath;
}
