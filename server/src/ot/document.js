'use strict';

const { EventEmitter } = require('events');
const { transform, apply, inputLength } = require('@rt-collab/shared');
const { ResyncError, StaleOperationError } = require('./errors');

const SNAPSHOT_OP_THRESHOLD = 50;
const SNAPSHOT_TIME_INTERVAL = 30000; // 30 seconds
const MAX_CATCHUP_GAP = 200;

/**
 * Manages OT state for a single document/room.
 * Accepts operations from clients, transforms against concurrent ops,
 * maintains version history, and emits events for broadcast.
 */
class Document {
  constructor(roomId, { content = '', version = 0, persistence = null } = {}) {
    this.roomId = roomId;
    this.content = content;
    this.version = version;
    this.history = []; // Array<{ op, userId, version }>
    this.baseVersion = version; // version of earliest op in history
    this.clients = new Set();
    this.emitter = new EventEmitter();
    this.persistence = persistence;

    this.opsSinceSnapshot = 0;
    this.snapshotOpThreshold = SNAPSHOT_OP_THRESHOLD;
    this.snapshotTimeInterval = SNAPSHOT_TIME_INTERVAL;
    this.maxCatchupGap = MAX_CATCHUP_GAP;

    this.snapshotTimer = null;
    this._startSnapshotTimer();
  }

  /**
   * Receive an operation from a client, transform if needed, apply, and broadcast.
   *
   * @param {Array} clientOp - The operation from the client
   * @param {number} baseVersion - The document version the client's op is based on
   * @param {string} userId - The client's user ID
   * @returns {{ op: Array, version: number }}
   */
  receiveOperation(clientOp, baseVersion, userId) {
    // Validate baseVersion
    if (baseVersion > this.version) {
      throw new StaleOperationError(
        `Base version ${baseVersion} is ahead of server version ${this.version}`
      );
    }

    if (baseVersion < this.baseVersion) {
      throw new ResyncError(
        `Base version ${baseVersion} is before history start ${this.baseVersion}`
      );
    }

    if (this.version - baseVersion > this.maxCatchupGap) {
      throw new ResyncError(
        `Version gap ${this.version - baseVersion} exceeds max catchup gap ${this.maxCatchupGap}`
      );
    }

    // Catchup transform: transform client op against all ops since baseVersion
    let transformedOp = clientOp;
    if (baseVersion < this.version) {
      const startIndex = baseVersion - this.baseVersion;
      const endIndex = this.version - this.baseVersion;
      for (let i = startIndex; i < endIndex; i++) {
        const serverOp = this.history[i].op;
        // Server op is 'a' (left priority = server wins tie-breaks)
        const [, clientPrime] = transform(serverOp, transformedOp, 'left');
        transformedOp = clientPrime;
      }
    }

    // Safety check
    if (inputLength(transformedOp) !== this.content.length) {
      throw new Error(
        `Transform produced op with inputLength ${inputLength(transformedOp)} ` +
        `but document length is ${this.content.length}`
      );
    }

    // Apply
    this.content = apply(this.content, transformedOp);
    this.version++;

    const entry = { op: transformedOp, userId, version: this.version };
    this.history.push(entry);

    // Persist (fire-and-forget)
    if (this.persistence) {
      this.persistence.saveOperation(this.roomId, entry).catch(() => {});
    }

    this.opsSinceSnapshot++;
    this._checkSnapshot();

    // Broadcast
    this.emitter.emit('operation', {
      op: transformedOp,
      version: this.version,
      userId,
    });

    return { op: transformedOp, version: this.version };
  }

  /**
   * Get current document state for sync/resync.
   */
  getState() {
    return { content: this.content, version: this.version };
  }

  addClient(clientId) {
    this.clients.add(clientId);
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    if (this.clients.size === 0) {
      this.emitter.emit('empty');
    }
  }

  subscribe(event, handler) {
    this.emitter.on(event, handler);
  }

  unsubscribe(event, handler) {
    this.emitter.off(event, handler);
  }

  _checkSnapshot() {
    if (this.opsSinceSnapshot >= this.snapshotOpThreshold) {
      this._takeSnapshot();
    }
  }

  _takeSnapshot() {
    this.opsSinceSnapshot = 0;
    const snapshot = {
      roomId: this.roomId,
      content: this.content,
      version: this.version,
    };

    if (this.persistence) {
      this.persistence.saveSnapshot(snapshot).catch(() => {});
    }

    this.emitter.emit('snapshot', snapshot);
  }

  _trimHistory() {
    this.history = [];
    this.baseVersion = this.version;
  }

  _startSnapshotTimer() {
    this.snapshotTimer = setInterval(() => {
      if (this.opsSinceSnapshot > 0) {
        this._takeSnapshot();
      }
    }, this.snapshotTimeInterval);

    if (this.snapshotTimer.unref) {
      this.snapshotTimer.unref();
    }
  }

  _stopSnapshotTimer() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  destroy() {
    this._stopSnapshotTimer();
    if (this.opsSinceSnapshot > 0 && this.persistence) {
      this._takeSnapshot();
    }
    this.emitter.removeAllListeners();
  }
}

module.exports = { Document };
