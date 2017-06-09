/* @flow */

import Pouch from '../../../src/pouch'

import DirMetadataBuilder from './dir'

export default class MetadataBuilders {
  pouch: Pouch

  constructor (pouch: Pouch) {
    this.pouch = pouch
  }

  dirMetadata (): DirMetadataBuilder {
    return new DirMetadataBuilder(this.pouch)
  }
}
