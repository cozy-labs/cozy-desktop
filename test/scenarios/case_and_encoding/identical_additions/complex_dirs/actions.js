/* eslint-disable no-multi-spaces */
/* @flow */

module.exports = [
  {type: 'mkdir', path: 'JOHN'},
  {type: 'mkdir', path: 'JOHN/exact-same-subdir'},
  {type: 'create_file', path: 'JOHN/exact-same-subdir/a.txt'},
  {type: 'create_file', path: 'JOHN/exact-same-subdir/b.txt'},
  {type: 'mkdir', path: 'JOHN/other-subdir-JOHN-1'},
  {type: 'mkdir', path: 'john'},
  {type: 'mkdir', path: 'john/exact-same-subdir'},
  {type: 'create_file', path: 'john/exact-same-subdir/a.txt'},
  {type: 'create_file', path: 'john/exact-same-subdir/b.txt'},
  {type: 'mkdir', path: 'john/other-subdir-john-2'}
  // TODO:
  // {type: 'mkdir', path: 'JOHN/IDENTICAL-SUBDIR'},
  // {type: 'mkdir', path: 'john/identical-subdir'},
]
