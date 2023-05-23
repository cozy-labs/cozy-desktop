// Stub Module loading using the cache to return fake modules when required
// See https://github.com/nodejs/node/blob/b54504c1d53796e02967e2c6c0a48416e64cf4e1/lib/internal/modules/cjs/loader.js#L928-L929

const { Module } = require('module')
const path = require('path')

const COZY_LOGGER_KEY = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'cozy-logger',
  'src',
  'index.js'
)

const stubbedModuleFilenames = new Map()

const originalResolver = Module._resolveFilename
Module._resolveFilename = (request, parent, isMain) => {
  if (stubbedModuleFilenames.has(request)) {
    return stubbedModuleFilenames.get(request)
  }

  return originalResolver(request, parent, isMain)
}

const stubModule = (name, key, exports) => {
  if (process.env.DEBUG || process.env.TESTDEBUG) {
    // eslint-disable-next-line no-console
    console.log(`Stubbing module ${name} (${key})`)
  }

  const m = new Module(key)
  m.exports = exports
  m.loaded = true

  Module._cache[key] = m
  stubbedModuleFilenames.set(name, key)
}

const initialize = () => {
  stubModule('cozy-logger', COZY_LOGGER_KEY, {
    default: () => {},
    addFilter: () => {},
    setNoRetry: () => {},
    setLevel: () => {},
    namespace: () => {}
  })
}

module.exports = {
  initialize
}
