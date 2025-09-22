import fs from 'node:fs/promises';

let cvPromise: Promise<any> | null = null;

const loadCv = async () => {
  if (!cvPromise) {
    cvPromise = (async () => {
      const module = await import('opencv-wasm');
      const cv = await module.default();
      return cv;
    })();
  }
  return cvPromise;
};

export const applyColorExposureFix = async (inputPath: string): Promise<Buffer> => {
  const cv = await loadCv();
  const buffer = await fs.readFile(inputPath);
  const mat = cv.imdecode(new Uint8Array(buffer), cv.IMREAD_COLOR);
  if (!mat || mat.empty()) {
    throw new Error('Failed to decode image for OpenCV enhancements');
  }

  const lab = new cv.Mat();
  cv.cvtColor(mat, lab, cv.COLOR_BGR2Lab);
  const labChannels = new cv.MatVector();
  cv.split(lab, labChannels);
  const lChannel = labChannels.get(0);
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  clahe.apply(lChannel, lChannel);
  labChannels.set(0, lChannel);
  const mergedLab = new cv.Mat();
  cv.merge(labChannels, mergedLab);
  const balanced = new cv.Mat();
  cv.cvtColor(mergedLab, balanced, cv.COLOR_Lab2BGR);

  const bgrChannels = new cv.MatVector();
  cv.split(balanced, bgrChannels);
  const means: number[] = [];
  for (let i = 0; i < bgrChannels.size(); i++) {
    const ch = bgrChannels.get(i);
    const meanScalar = cv.mean(ch);
    means.push(meanScalar[0]);
  }
  const avgMean = means.reduce((acc, val) => acc + val, 0) / (means.length || 1) || 1;

  const adjustedChannels = new cv.MatVector();
  for (let i = 0; i < bgrChannels.size(); i++) {
    const channel = bgrChannels.get(i);
    const scale = means[i] ? avgMean / means[i] : 1;
    const scaled = new cv.Mat();
    channel.convertTo(scaled, -1, scale, 0);
    adjustedChannels.push_back(scaled);
    channel.delete();
  }

  const resultMat = new cv.Mat();
  cv.merge(adjustedChannels, resultMat);
  const encoded = cv.imencode('.jpg', resultMat);
  const outputBuffer = Buffer.from(encoded);

  // Cleanup
  mat.delete();
  lab.delete();
  mergedLab.delete();
  balanced.delete();
  resultMat.delete();
  lChannel.delete();
  clahe.delete();
  labChannels.delete();
  adjustedChannels.delete();
  bgrChannels.delete();

  return outputBuffer;
};
