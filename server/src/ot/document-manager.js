'use strict';

const { apply } = require('@rt-collab/shared');
const { Document } = require('./document');

const DEFAULT_IDLE_TIMEOUT = 300000; // 5 minutes

/**
 * Registry that maps roomId -> Document instances.
 * Handles creation, loading from persistence, and idle cleanup.
 */
class DocumentManager {
  constructor({ persistence = null, idleTimeout = DEFAULT_IDLE_TIMEOUT } = {}) {
    this.documents = new Map();
    this.persistence = persistence;
    this.idleTimeout = idleTimeout;
    this.idleTimers = new Map();
  }

  /**
   * Get an existing Document or load one from persistence.
   * @param {string} roomId
   * @returns {Promise<Document>}
   */
  async getOrLoad(roomId) {
    if (this.documents.has(roomId)) {
      // Cancel any pending idle unload
      if (this.idleTimers.has(roomId)) {
        clearTimeout(this.idleTimers.get(roomId));
        this.idleTimers.delete(roomId);
      }
      return this.documents.get(roomId);
    }

    // Load from persistence
    let content = '';
    let version = 0;

    if (this.persistence) {
      const snapshot = await this.persistence.loadLatestSnapshot(roomId);
      if (snapshot) {
        content = snapshot.content;
        version = snapshot.version;
      }

      const ops = await this.persistence.loadOperationsSince(roomId, version);
      for (const entry of ops) {
        content = apply(content, entry.op);
        version = entry.version;
      }
    }

    const doc = new Document(roomId, {
      content,
      version,
      persistence: this.persistence,
    });

    doc.subscribe('empty', () => this._scheduleUnload(roomId));
    this.documents.set(roomId, doc);
    return doc;
  }

  /**
   * Get a document only if it's already loaded in memory.
   * @param {string} roomId
   * @returns {Document|undefined}
   */
  get(roomId) {
    return this.documents.get(roomId);
  }

  _scheduleUnload(roomId) {
    if (this.idleTimers.has(roomId)) {
      clearTimeout(this.idleTimers.get(roomId));
    }

    const timer = setTimeout(() => {
      const doc = this.documents.get(roomId);
      if (doc && doc.clients.size === 0) {
        doc.destroy();
        this.documents.delete(roomId);
      }
      this.idleTimers.delete(roomId);
    }, this.idleTimeout);

    if (timer.unref) timer.unref();
    this.idleTimers.set(roomId, timer);
  }

  /**
   * Graceful shutdown: destroy all documents, clear all timers.
   */
  destroyAll() {
    for (const [, timer] of this.idleTimers) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    for (const [, doc] of this.documents) {
      doc.destroy();
    }
    this.documents.clear();
  }
}

module.exports = { DocumentManager };
