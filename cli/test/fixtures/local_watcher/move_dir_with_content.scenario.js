module.exports = {
  init: [
    'parent/',
    'parent/dst/',
    'parent/src/',
    'parent/src/dir/',
    'parent/src/dir/empty-subdir/',
    'parent/src/dir/subdir/',
    'parent/src/dir/subdir/file',
  ],
  actions: [
    {type: "mv", src: "parent/src/dir", dst: "parent/dst/dir"},
  ],
}
