// @flow

const BaseMetadataBuilder = require('./base')

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  attributesByType () /*: * */ {
    return {
      docType: 'folder'
    }
  }
}
