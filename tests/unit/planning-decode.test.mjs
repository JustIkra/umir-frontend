import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/completion-v1-examples.json' with { type: 'json' };
import { decodeRecommendations } from '../../src/adapters/api/decode/serving.ts';

test('FIN1 recommendation values stay exact and include observed coverage', () => {
  const decoded = decodeRecommendations(
    examples.examples[2].value.result,
    'result',
  );
  assert.equal(decoded.policyVersion, 'FIN1');
  assert.equal(decoded.items[0].score, '0.666667');
  assert.equal(decoded.items[1].reasons[0].quantityPerPortion, '5000');
  assert.equal(decoded.items[0].reasons[0].targetPortions, '10');
  assert.equal(decoded.coverage.complete, false);
});

test('FIN1 malformed, unknown and inconsistent recommendation fields are refused', () => {
  for (const change of [
    (v) => {
      v.items[0].score = 'NaN';
    },
    (v) => {
      v.items[0].score = '1e3';
    },
    (v) => {
      v.items[0].reasons[0].riskQuantity = '9223372036854775808';
    },
    (v) => {
      v.items[0].reasons[0].targetPortions = 10;
    },
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.items[0].reasons[0].extra = true;
    },
    (v) => {
      v.items[0].reasons[0].remainingSeconds = '1';
    },
    (v) => {
      v.items[0].priorityExpiresAt = '2027-01-01T00:00:00+03:00';
    },
  ]) {
    const value = structuredClone(examples.examples[2].value.result);
    change(value);
    assert.throws(() => decodeRecommendations(value, 'result'));
  }
});
