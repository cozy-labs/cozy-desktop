/* @flow */

import type { Metadata } from '../../../../core/metadata'

const crypto = require('crypto')

const BaseMetadataBuilder = require('./base')
const { assignId } = require('../../../../core/metadata')
const Pouch = require('../../../../core/pouch')

const pouchdbBuilders = require('../pouchdb')

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  fileOpts: {
    size: number,
    md5sum: string
  }

  constructor (pouch: ?Pouch) {
    super(pouch)
    this.fileOpts = {
      size: 0,
      md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==' // empty
    }
  }

  data (data: string): this {
    this.fileOpts.size = Buffer.from(data).length
    this.fileOpts.md5sum =
      crypto.createHash('md5').update(data).digest().toString('base64')
    return this
  }

  build (): Metadata {
    const doc = {
      _id: '',
      // _rev: pouchdbBuilders.rev(),
      docType: 'file',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      tags: [],
      updated_at: new Date(),
      ...this.opts,
      ...this.fileOpts
    }
    assignId(doc)
    return doc
  }
}
