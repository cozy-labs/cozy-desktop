/* @flow */

const cheerio = require('cheerio')
const request = require('request')
const url = require('url')
const logger = require('../../core/logger')
const Registration = require('../../core/remote/registration')

module.exports = automatedRegistration

const client = request.defaults({
  jar: true,
  timeout: 120000
})
const log = logger({
  component: 'remote/automated_registration'
})

function automatedRegistration(
  cozyUrl /*: string */,
  passphrase /*: string */,
  storage /*: * */
) /*: Registration */ {
  return new Registration(cozyUrl, storage, authorizeUrl => {
    return new Promise((resolve, reject) => {
      log.debug('Get CSRF token...')
      client.get(
        { url: new url.URL(cozyUrl + '/auth/login') },
        (err, _, body) => {
          if (err) {
            reject(err)
          }

          const $ = cheerio.load(body)
          const csrf = $('#csrf_token').val()

          log.debug({ csrf }, 'Login...')
          client.post(
            {
              url: new url.URL(cozyUrl + '/auth/login'),
              form: {
                passphrase,
                csrf_token: csrf
              }
            },
            err => {
              if (err) {
                reject(err)
              }

              log.debug('Load authorization form...')
              client({ url: authorizeUrl }, (err, _, body) => {
                if (err) {
                  reject(err)
                }

                log.debug('Parse authorization form...')
                const $ = cheerio.load(body)
                const form = $('form.auth')
                  .serializeArray()
                  .reduce((data, param) => {
                    data[param.name] = param.value
                    return data
                  }, {})

                log.debug('Authorize...')
                client.post({ url: authorizeUrl, form }, (err, res, body) => {
                  if (err) {
                    reject(err)
                  }

                  if (!res.headers.location) {
                    err = new Error(
                      'Cozy login failed. Please make sure passphrase is correct.'
                    )
                    log.error({ body }, err)
                    reject(err)
                    return
                  }

                  log.debug('Save credentials...')
                  client({ url: res.headers.location }, err => {
                    if (err) {
                      reject(err)
                    }

                    resolve(cozyUrl)
                  })
                })
              })
            }
          )
        }
      )
    })
  })
}
