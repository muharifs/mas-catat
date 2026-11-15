// Errors raised by the persistence layer. Money rule violations stay DomainError (src/domain).

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Undoing a skip would leave a member with negative credit: the credit that the skip released was refunded since.
 * The undo is rolled back, nothing is written, and the skip stays in force.
 */
export class SkipUndoBlockedError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'SkipUndoBlockedError';
  }
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}
