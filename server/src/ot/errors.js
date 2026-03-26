'use strict';

class ResyncError extends Error {
  constructor(message = 'Version gap too large, client must resync') {
    super(message);
    this.name = 'ResyncError';
    this.code = 'RESYNC_REQUIRED';
  }
}

class StaleOperationError extends Error {
  constructor(message = 'Base version is ahead of server version') {
    super(message);
    this.name = 'StaleOperationError';
    this.code = 'STALE_OPERATION';
  }
}

module.exports = { ResyncError, StaleOperationError };
