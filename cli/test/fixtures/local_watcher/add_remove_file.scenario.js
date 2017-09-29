module.exports = {
  actions: [
    {type: ">", path: "file"},
    {type: "rm", path: "file"},
  ],
  expected: {
    prepCalls: [
    ],
  },
}
