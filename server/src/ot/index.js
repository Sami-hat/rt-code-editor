'use strict';

const { Document } = require('./document');
const { DocumentManager } = require('./document-manager');
const { ResyncError, StaleOperationError } = require('./errors');

module.exports = {
  Document,
  DocumentManager,
  ResyncError,
  StaleOperationError,
};
