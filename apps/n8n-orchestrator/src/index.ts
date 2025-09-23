import { ExamplePipelineNode } from './nodes/ExamplePipelineNode.js';
import { runBackgroundTask } from './pipelines/background.js';

export const nodes = [ExamplePipelineNode];
export const credentials: unknown[] = [];

export { runBackgroundTask };
