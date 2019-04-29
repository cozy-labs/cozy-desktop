/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  // FIXME: fails on darwin because cozy-stack uses case-insensitive APFS
  platforms: ['win32'],
  init: [
    { ino: 1, path: 'dir-case/' },
    { ino: 2, path: 'file-case' },
    { ino: 3, path: 'dir-nfc-to-nfd-\u00e9/' },
    { ino: 4, path: 'file-nfc-to-nfd-\u00e9' }
    // NFD -> NFC doesn't work the same on every OSes
  ],
  actions: [
    { type: 'mv', src: 'dir-case', dst: 'DIR-CASE' },
    { type: 'mv', src: 'file-case', dst: 'FILE-CASE' },
    { type: 'mv', src: 'dir-nfc-to-nfd-\u00e9', dst: 'dir-nfc-to-nfd-e\u0301' },
    {
      type: 'mv',
      src: 'file-nfc-to-nfd-\u00e9',
      dst: 'file-nfc-to-nfd-e\u0301'
    }
  ],
  expected: {
    tree: [
      'DIR-CASE/',
      'FILE-CASE',
      'dir-nfc-to-nfd-e\u0301/',
      'file-nfc-to-nfd-e\u0301'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
