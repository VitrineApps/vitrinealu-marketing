declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    output(destination: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    size(size: string): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    videoBitrate(bitrate: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
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