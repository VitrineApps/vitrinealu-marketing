import { logger } from '@vitrinealu/shared/logger';
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionType
} from 'n8n-workflow';

export class ExamplePipelineNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Example Pipeline',
    name: 'examplePipeline',
    group: ['transform'],
    version: 1,
    description: 'Demonstration node that echoes a message back into the workflow',
    defaults: {
      name: 'Example Pipeline'
    },
    inputs: ['main'] as NodeConnectionType[],
    outputs: ['main'] as NodeConnectionType[],
    icon: 'fa:cogs',
    properties: [
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        default: 'Pipeline executed',
        required: true,
        description: 'Message returned in the node output'
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const message = this.getNodeParameter('message', 0) as string;
    const childLogger = logger.child({ scope: 'nodes.examplePipeline' });

    childLogger.info({ message }, 'Executing example pipeline node');

    const results = items.map(() => ({
      json: { message, timestamp: new Date().toISOString() }
    }));

    return [results];
  }
}
