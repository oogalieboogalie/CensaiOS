export async function handleHttpTool(agentId, name, args) {
  switch (name) {
    case 'http_test': {
      if (!args.url) return 'http_test requires args.url to be set.';

      const method = (args.method || 'GET').toUpperCase();
      const timeoutMs = args.timeout_ms || 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions = {
        method,
        signal: controller.signal,
        headers: args.headers || {},
      };
      if (args.body && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = args.body;
      }

      const startTime = Date.now();

      try {
        const response = await fetch(args.url, fetchOptions);
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        const bodyText = await response.text().catch(() => '(could not read body)');
        const truncatedBody = bodyText.length > 2000 ? bodyText.slice(0, 2000) + '\n... [truncated]' : bodyText;

        const statusMatch = args.expected_status != null
          ? `\nExpected Status: ${args.expected_status} → ${response.status === args.expected_status ? '✓ MATCH' : `✗ MISMATCH (got ${response.status})`}`
          : '';

        const headersOut = [...response.headers.entries()]
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n');

        return [
          `URL:        ${args.url}`,
          `Method:     ${method}`,
          `Status:     ${response.status} ${response.statusText}`,
          `Latency:    ${latencyMs}ms`,
          statusMatch,
          `\nRESPONSE HEADERS\n${headersOut || '  (none)'}`,
          `\nBODY (first 2000 chars)\n${truncatedBody || '(empty body)'}`,
        ].filter(Boolean).join('\n');

      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return `http_test timeout: No response from ${args.url} within ${timeoutMs}ms.`;
        }
        return `http_test error for ${args.url}: ${err.message}`;
      }
    }

    default:
      throw new Error(`Unknown http tool: ${name}`);
  }
}
