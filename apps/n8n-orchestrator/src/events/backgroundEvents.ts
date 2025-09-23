import { EventEmitter } from 'events';

export interface BackgroundJobStartedEvent {
  jobId: string;
  mediaId: string;
  projectId: string;
  inputPath: string;
  callbackUrl?: string;
}

export interface BackgroundJobSucceededEvent {
  jobId: string;
  mediaId: string;
  projectId: string;
  outputUrl: string;
  callbackUrl?: string;
}

export interface BackgroundJobFailedEvent {
  jobId: string;
  mediaId: string;
  projectId: string;
  error: string;
  callbackUrl?: string;
}

export declare interface BackgroundEventEmitter {
  on(event: 'backgroundJobStarted', listener: (event: BackgroundJobStartedEvent) => void): this;
  on(event: 'backgroundJobSucceeded', listener: (event: BackgroundJobSucceededEvent) => void): this;
  on(event: 'backgroundJobFailed', listener: (event: BackgroundJobFailedEvent) => void): this;

  emit(event: 'backgroundJobStarted', data: BackgroundJobStartedEvent): boolean;
  emit(event: 'backgroundJobSucceeded', data: BackgroundJobSucceededEvent): boolean;
  emit(event: 'backgroundJobFailed', data: BackgroundJobFailedEvent): boolean;
}

export class BackgroundEventEmitter extends EventEmitter {}

export const backgroundEvents = new BackgroundEventEmitter();