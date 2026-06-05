import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAttemptCostUsd,
  computeGenerationCostUsd,
  getPricingConfig,
} from './aiUsageCost.js';

describe('aiUsageCost', () => {
  const pricing = {
    inputUsdPer1M: 0.3,
    imageOutputUsdPer1M: 30,
    usdToBrl: 5.5,
  };

  it('computeAttemptCostUsd returns 0 for non-billable attempts', () => {
    assert.equal(
      computeAttemptCostUsd({ billable: false, promptTokenCount: 1000 }, pricing),
      0,
    );
  });

  it('computeAttemptCostUsd calculates input + image output', () => {
    const cost = computeAttemptCostUsd(
      {
        billable: true,
        promptTokenCount: 800,
        candidatesTokenCount: 1290,
        thoughtsTokenCount: 0,
      },
      pricing,
    );
    const expected = (800 / 1e6) * 0.3 + (1290 / 1e6) * 30;
    assert.ok(Math.abs(cost - expected) < 1e-9);
    assert.ok(cost > 0.038 && cost < 0.042);
  });

  it('computeGenerationCostUsd sums billable attempts only', () => {
    const { estimatedCostUsd } = computeGenerationCostUsd(
      [
        {
          billable: true,
          promptTokenCount: 500,
          candidatesTokenCount: 1290,
          thoughtsTokenCount: 0,
          modelId: 'gemini-2.5-flash-image',
          outcome: 'success',
        },
        {
          billable: false,
          promptTokenCount: 9000,
          candidatesTokenCount: 0,
          modelId: 'gemini-2.5-flash-image',
          outcome: 'failed',
        },
      ],
      'gemini-2.5-flash-image',
      pricing,
    );
    const single = computeAttemptCostUsd(
      {
        billable: true,
        promptTokenCount: 500,
        candidatesTokenCount: 1290,
        thoughtsTokenCount: 0,
      },
      pricing,
    );
    assert.equal(estimatedCostUsd, Math.round(single * 1_000_000) / 1_000_000);
  });

  it('getPricingConfig reads env overrides', () => {
    const prevIn = process.env.GEMINI_INPUT_USD_PER_1M;
    const prevOut = process.env.GEMINI_IMAGE_OUTPUT_USD_PER_1M;
    process.env.GEMINI_INPUT_USD_PER_1M = '0.25';
    process.env.GEMINI_IMAGE_OUTPUT_USD_PER_1M = '28';
    try {
      const cfg = getPricingConfig();
      assert.equal(cfg.inputUsdPer1M, 0.25);
      assert.equal(cfg.imageOutputUsdPer1M, 28);
    } finally {
      if (prevIn === undefined) delete process.env.GEMINI_INPUT_USD_PER_1M;
      else process.env.GEMINI_INPUT_USD_PER_1M = prevIn;
      if (prevOut === undefined) delete process.env.GEMINI_IMAGE_OUTPUT_USD_PER_1M;
      else process.env.GEMINI_IMAGE_OUTPUT_USD_PER_1M = prevOut;
    }
  });
});
