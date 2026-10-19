// The one error every hosted-agent step throws: plain words, an HTTP status
// and a code, never the key or the vendor's raw body.

export class HostedAgentError extends Error {
  constructor(message, status = 502, code = 'HOSTED_AGENT_FAILED') {
    super(message);
    this.name = 'HostedAgentError';
    this.statusCode = status;
    this.code = code;
  }
}
