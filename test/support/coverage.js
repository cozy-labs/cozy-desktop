// See: https://github.com/MarshallOfSound/Google-Play-Music-Desktop-Player-UNOFFICIAL-/blob/1b2055b286f1f296c0d48dec714224c14acb3c34/test/electron/util/coverage.js

import Module from 'module'

const originalRequire = Module.prototype.require

Module.prototype.require = function fancyCoverageRequireHack (moduleName, ...args) {
  try {
    return originalRequire.call(this, moduleName.replace('core/', 'core-cov/'), ...args)
  } catch (e) {
    return originalRequire.call(this, moduleName, ...args)
  }
}
