import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenRouterUsage } from '../utils/openrouterUsage.js';

test('extracts OpenRouter usage into a database-friendly record', () => {
    const record = extractOpenRouterUsage({
        endpoint: '/api/identify',
        model: 'google/gemini-2.5-flash-lite',
        statusCode: 200,
        response: {
            usage: {
                prompt_tokens: 123,
                completion_tokens: 45,
                total_tokens: 168,
                cost: 0.0000303,
                is_byok: false
            }
        }
    });

    assert.deepEqual(record, {
        endpoint: '/api/identify',
        model: 'google/gemini-2.5-flash-lite',
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
        costUsd: 0.0000303,
        isByok: false,
        statusCode: 200,
        error: null
    });
});

test('returns null when OpenRouter response has no usage block', () => {
    const record = extractOpenRouterUsage({
        endpoint: '/api/identify',
        model: 'google/gemini-2.5-flash-lite',
        statusCode: 500,
        response: { error: { message: 'quota exceeded' } }
    });

    assert.equal(record, null);
});
