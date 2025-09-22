import { describe, expect, it } from 'vitest';

import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { ExamplePipelineNode } from './ExamplePipelineNode';

const createExecuteContext = (): IExecuteFunctions => {
  const items: INodeExecutionData[] = [{ json: {} }];
  return {
    getInputData: () => items,
    getNodeParameter: () => 'Hello'
  } as unknown as IExecuteFunctions;
};

describe('ExamplePipelineNode', () => {
  it('returns provided message', async () => {
    const node = new ExamplePipelineNode();
    const context = createExecuteContext();
    const [result] = await node.execute.call(context);
    expect(result[0].json).toMatchObject({ message: 'Hello' });
  });
});
