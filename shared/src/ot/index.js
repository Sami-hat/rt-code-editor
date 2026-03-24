'use strict';

const {
  retain,
  insert,
  del,
  isRetain,
  isInsert,
  isDelete,
  compLength,
  inputLength,
  outputLength,
  normalize,
  identity,
} = require('./operations');
const { apply } = require('./apply');
const { transform } = require('./transform');
const { compose } = require('./compose');

module.exports = {
  retain,
  insert,
  del,
  isRetain,
  isInsert,
  isDelete,
  compLength,
  inputLength,
  outputLength,
  normalize,
  identity,
  apply,
  transform,
  compose,
};
