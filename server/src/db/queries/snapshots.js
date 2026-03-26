'use strict';

/**
 * In-memory snapshot store. Implements the interface that a PostgreSQL
 * adapter will later provide.
 */
class SnapshotStore {
  constructor() {
    this.snapshots = new Map(); // roomId -> Array<{ content, version, createdAt }>
  }

  async saveSnapshot(snapshot) {
    const { roomId, content, version } = snapshot;
    if (!this.snapshots.has(roomId)) {
      this.snapshots.set(roomId, []);
    }
    this.snapshots.get(roomId).push({
      content,
      version,
      createdAt: new Date(),
    });
  }

  async loadLatestSnapshot(roomId) {
    const all = this.snapshots.get(roomId) || [];
    if (all.length === 0) return null;
    return all.reduce((best, snap) =>
      snap.version > best.version ? snap : best
    );
  }
}

module.exports = { SnapshotStore };
