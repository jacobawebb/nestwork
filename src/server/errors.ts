export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'BAD_REQUEST',
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|foreign key/i.test(error.message);
}
