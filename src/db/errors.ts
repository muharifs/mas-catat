// Errors raised by the persistence layer. Money rule violations stay DomainError (src/domain).

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}
