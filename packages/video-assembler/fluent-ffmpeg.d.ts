declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(input: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    complexFilter(filters: string | string[]): FfmpegCommand;
    output(output: string): FfmpegCommand;
    duration(duration: number): FfmpegCommand;
    size(size: string): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    format(format: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    videoBitrate(bitrate: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    audioFrequency(frequency: number): FfmpegCommand;
    videoFilters(filters: string | string[]): FfmpegCommand;
    map(stream: string): FfmpegCommand;
    concat(count: number): FfmpegCommand;
    on(event: string, callback: (...args: unknown[]) => void): FfmpegCommand;
    run(): void;
  }

  interface FfmpegStatic {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): void;
    getAvailableFormats(callback: (err: unknown, formats: unknown) => void): void;
    ffprobe(filePath: string, callback: (err: unknown, metadata: unknown) => void): void;
  }

  const ffmpeg: FfmpegStatic;
  export = ffmpeg;
}