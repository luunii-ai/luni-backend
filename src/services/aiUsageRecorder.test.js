import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsageReport } from './aiUsageRecorder.js';

describe('parseUsageReport', () => {
  it('parses snake_case usage_report from agent', () => {
    const { attempts, successfulModelId } = parseUsageReport({
      usage_report: {
        attempts: [
          {
            model_id: 'gemini-2.5-flash-image',
            transport: 'genai',
            attempt_number: 1,
            outcome: 'success',
            token_source: 'google_usage_metadata',
            http_status: 200,
            billable: true,
            prompt_token_count: 800,
            candidates_token_count: 1290,
            total_token_count: 2090,
          },
        ],
        successful_model_id: 'gemini-2.5-flash-image',
      },
    });

    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].promptTokenCount, 800);
    assert.equal(attempts[0].candidatesTokenCount, 1290);
    assert.equal(attempts[0].billable, true);
    assert.equal(successfulModelId, 'gemini-2.5-flash-image');
  });

  it('marks 400/500 as non-billable when billable omitted', () => {
    const { attempts } = parseUsageReport({
      usage_report: {
        attempts: [
          {
            model_id: 'gemini-2.5-flash-image',
            transport: 'genai',
            http_status: 500,
            token_source: 'google_usage_metadata',
            prompt_token_count: 100,
            candidates_token_count: 0,
          },
        ],
      },
    });
    assert.equal(attempts[0].billable, false);
  });

  it('returns empty for missing report', () => {
    const parsed = parseUsageReport({});
    assert.deepEqual(parsed.attempts, []);
    assert.equal(parsed.successfulModelId, '');
  });
});
