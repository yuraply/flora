export function extractOpenRouterUsage({ endpoint, model, statusCode, response }) {
    const usage = response?.usage;
    if (!usage) return null;

    return {
        endpoint,
        model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        costUsd: usage.cost ?? 0,
        isByok: Boolean(usage.is_byok),
        statusCode,
        error: response?.error?.message || null
    };
}
