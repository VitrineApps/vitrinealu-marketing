import { createCarouselDraft, RateLimitError, ValidationError, ApiError } from '../src/bufferClient';
import { CarouselDraftInput } from '../src/types';
import nock from 'nock';

describe('createCarouselDraft', () => {
  const baseUrl = process.env.BUFFER_BASE_URL || 'https://api.buffer.com/2/';
  const token = 'test-token';
  const defaultInput: CarouselDraftInput = {
    channelId: 'profile-123',
    text: 'Test carousel',
    mediaUrls: ['url1', 'url2'],
    platform: 'instagram' as const,
  };

  afterEach(() => nock.cleanAll());

  it('success → returns {updateId, mediaIds}', async () => {
    nock(baseUrl)
      .post('/updates/create.json')
      .reply(200, {
        update: { id: 'update-1', media_attachments: [{ id: 'm1' }, { id: 'm2' }], service: 'instagram' }
      });
    const result = await createCarouselDraft(defaultInput);
    expect(result).toEqual({ updateId: 'update-1', mediaIds: ['m1', 'm2'], platform: 'instagram' });
  });

  it('429 with Retry-After → retries then success', async () => {
    nock(baseUrl)
      .post('/updates/create.json')
      .reply(429, {}, { 'Retry-After': '1' })
      .post('/updates/create.json')
      .reply(200, {
        update: { id: 'update-2', media_attachments: [{ id: 'm3' }, { id: 'm4' }], service: 'facebook' }
      });
  const input = { ...defaultInput, platform: 'facebook' as const };
    const result = await createCarouselDraft(input);
    expect(result).toEqual({ updateId: 'update-2', mediaIds: ['m3', 'm4'], platform: 'facebook' });
  });

  it('4xx validation → throws ApiError without retry', async () => {
    nock(baseUrl)
      .post('/updates/create.json')
      .reply(400, { error: 'Invalid request' });
    await expect(createCarouselDraft(defaultInput)).rejects.toThrow(ApiError);
  });

  it('media count <2 or >5 → throws ValidationError', async () => {
    await expect(createCarouselDraft({ ...defaultInput, mediaUrls: ['one'] })).rejects.toThrow(ValidationError);
    await expect(createCarouselDraft({ ...defaultInput, mediaUrls: ['1','2','3','4','5','6'] })).rejects.toThrow(ValidationError);
  });

  it('Assert headers contain bearer token, text length <= platform caps', async () => {
    nock(baseUrl)
      .post('/updates/create.json', (body) => {
        expect(body.text.length).toBeLessThanOrEqual(2200);
        return true;
      })
      .matchHeader('Authorization', `Bearer ${token}`)
      .reply(200, {
        update: { id: 'update-3', media_attachments: [{ id: 'm5' }, { id: 'm6' }], service: 'instagram' }
      });
    process.env.BUFFER_ACCESS_TOKEN = token;
    await createCarouselDraft({ ...defaultInput, text: 'a'.repeat(2200) });
  });
});
