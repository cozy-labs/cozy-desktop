/* @flow */

import Pouch from '../../../../core/pouch'

import DirMetadataBuilder from './dir'
import FileMetadataBuilder from './file'

export default class MetadataBuilders {
  pouch: ?Pouch

  constructor (pouch: ?Pouch) {
    this.pouch = pouch
  }

  dir (): DirMetadataBuilder {
    return new DirMetadataBuilder(this.pouch)
  }

  file (): FileMetadataBuilder {
    return new FileMetadataBuilder(this.pouch)
  }
}
