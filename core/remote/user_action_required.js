/* @flow */

const logger = require('../logger')

const log = logger({
  component: 'remote/user_action_required'
})

module.exports = {
  includeJSONintoError
}

function includeJSONintoError (err: Error) {
  let err2 = err
  try {
    const parsed = JSON.parse(err.message)
    err2 = Object.assign(new Error('User action required'), parsed[0])
    err2.status = parseInt(err2.status)
  } catch (err) {
    log.error({err}, 'Wrongly formatted error')
  }
  return err2
}
