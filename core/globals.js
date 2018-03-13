const Promise = require('bluebird')

global.Promise = Promise
Promise.longStackTraces()
