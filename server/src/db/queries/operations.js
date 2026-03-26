'use strict';

/**
 * In-memory operation store. Implements the interface that a PostgreSQL
 * adapter will later provide.
 */
class OperationStore {
  constructor() {
    this.ops = new Map(); // roomId -> Array<{ op, userId, version, createdAt }>
  }

  async saveOperation(roomId, entry) {
    if (!this.ops.has(roomId)) {
      this.ops.set(roomId, []);
    }
    this.ops.get(roomId).push({
      op: entry.op,
      userId: entry.userId,
      version: entry.version,
      createdAt: new Date(),
    });
  }

  async loadOperationsSince(roomId, sinceVersion) {
    const all = this.ops.get(roomId) || [];
    return all.filter((e) => e.version > sinceVersion);
  }

  async loadOperationRange(roomId, fromVersion, toVersion) {
    const all = this.ops.get(roomId) || [];
    return all.filter((e) => e.version > fromVersion && e.version <= toVersion);
  }
}

module.exports = { OperationStore };
