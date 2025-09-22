export interface EnhanceProvider {
  name: string;
  isAvailable(): boolean;
  enhance(inputPath: string, outputPath: string): Promise<{ scale: number; ms: number }>;
}