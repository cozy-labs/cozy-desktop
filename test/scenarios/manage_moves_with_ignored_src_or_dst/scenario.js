/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'local',
  init: [{ ino: 2, path: 'file2', content: 'was not ignored' }],
  actions: [
    { type: 'create_file', path: 'file1.tmp' },
    { type: 'wait', ms: 1500 },
    { type: 'mv', src: 'file1.tmp', dst: 'file1' },
    { type: 'mv', src: 'file2', dst: 'file2.tmp' }
  ],
  expected: {
    localTree: ['file1', 'file2.tmp'],
    remoteTree: ['file1'],
    trash: ['file2']
  }
} /*: Scenario */)
