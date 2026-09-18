export type OpenAlexClientErrorCode =
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_REJECTED'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class OpenAlexClientError extends Error {
  public readonly code: OpenAlexClientErrorCode;
  public readonly status?: number;
  public readonly retryable: boolean;

  public constructor(message: string, options: { code: OpenAlexClientErrorCode; status?: number; retryable?: boolean }) {
    super(message);
    this.name = 'OpenAlexClientError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
