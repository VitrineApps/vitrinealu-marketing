export interface PipelineJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type WebhookEventType = 'pipeline.triggered' | 'pipeline.completed' | 'approval.submitted';

export interface WebhookEvent<TPayload = unknown> {
  id: string;
  type: WebhookEventType;
  payload: TPayload;
  receivedAt: string;
}
