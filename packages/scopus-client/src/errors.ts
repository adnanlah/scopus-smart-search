export class ScopusClientError extends Error {
  public readonly status?: number;
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(
    message: string,
    options: { code: string; status?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = 'ScopusClientError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
