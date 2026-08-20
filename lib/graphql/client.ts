export interface GraphQlErrorItem {
  message?: string;
  extensions?: Record<string, unknown>;
}

export class GraphQlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphQlConfigurationError';
  }
}

export class GraphQlRequestError extends Error {
  readonly status: number;
  readonly errors: GraphQlErrorItem[];

  constructor(message: string, status = 0, errors: GraphQlErrorItem[] = []) {
    super(message);
    this.name = 'GraphQlRequestError';
    this.status = status;
    this.errors = errors;
  }
}

export interface GraphQlClientOptions {
  serviceName: string;
  endpoint?: string;
  query?: string;
  headers?: Record<string, string>;
}

/**
 * Minimal server-side GraphQL transport. Provider-specific query documents
 * are supplied by deployment configuration; this client never falls back to
 * alternate provider protocols or undocumented provider endpoints.
 */
export class GraphQlClient {
  private readonly serviceName: string;
  private readonly endpoint?: string;
  private readonly query?: string;
  private readonly headers: Record<string, string>;

  constructor(options: GraphQlClientOptions) {
    this.serviceName = options.serviceName;
    this.endpoint = options.endpoint?.trim() || undefined;
    this.query = options.query?.trim() || undefined;
    this.headers = options.headers || {};
  }

  async execute<T>(operationName: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    if (!this.endpoint || !this.query) {
      throw new GraphQlConfigurationError(
        `${this.serviceName} GraphQL is not configured. Set ${this.serviceName.toUpperCase()}_GRAPHQL_ENDPOINT and ${this.serviceName.toUpperCase()}_GRAPHQL_QUERY.`,
      );
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify({ operationName, variables, query: this.query }),
        signal: signal || AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new GraphQlRequestError(error instanceof Error ? error.message : `${this.serviceName} GraphQL request failed`);
    }

    let body: { data?: T; errors?: GraphQlErrorItem[] };
    try {
      body = await response.json() as { data?: T; errors?: GraphQlErrorItem[] };
    } catch {
      throw new GraphQlRequestError(`${this.serviceName} GraphQL returned invalid JSON`, response.status);
    }

    if (!response.ok) {
      throw new GraphQlRequestError(`${this.serviceName} GraphQL request failed (${response.status})`, response.status, body.errors || []);
    }
    if (body.errors?.length) {
      throw new GraphQlRequestError(body.errors[0]?.message || `${this.serviceName} GraphQL request failed`, response.status, body.errors);
    }
    if (body.data === undefined) throw new GraphQlRequestError(`${this.serviceName} GraphQL response did not include data`, response.status);
    return body.data;
  }
}
