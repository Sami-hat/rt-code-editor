'use strict';

const { OperationStore } = require('./queries/operations');
const { SnapshotStore } = require('./queries/snapshots');

/**
 * Persistence facade that composes operation and snapshot stores.
 * The Document class depends on this interface.
 */
class Persistence {
  constructor({ operationStore, snapshotStore } = {}) {
    this.operationStore = operationStore || new OperationStore();
    this.snapshotStore = snapshotStore || new SnapshotStore();
  }

  async saveOperation(roomId, entry) {
    return this.operationStore.saveOperation(roomId, entry);
  }

  async saveSnapshot(snapshot) {
    return this.snapshotStore.saveSnapshot(snapshot);
  }

  async loadLatestSnapshot(roomId) {
    return this.snapshotStore.loadLatestSnapshot(roomId);
  }

  async loadOperationsSince(roomId, sinceVersion) {
    return this.operationStore.loadOperationsSince(roomId, sinceVersion);
  }
}

module.exports = { Persistence };
