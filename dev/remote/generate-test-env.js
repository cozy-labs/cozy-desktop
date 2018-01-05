import cheerio from 'cheerio'
import cozy from 'cozy-client-js'
import fs from 'fs'
import request from 'request'
import url from 'url'

import pkg from '../../package.json'
import Registration from '../../core/remote/registration'

const cozyUrl = process.env.COZY_URL
const passphrase = process.env.COZY_PASSPHRASE
const client = request.defaults({jar: true})
const storage = new cozy.MemoryStorage()

const automatedRegistration = new Registration(cozyUrl, storage, (authorizeUrl) => {
  return new Promise((resolve, reject) => {
    console.log('Get CSRF token...')
    client.get({url: url.resolve(cozyUrl, '/auth/login')}, (err, _, body) => {
      if (err) { reject(err) }

      const $ = cheerio.load(body)
      const csrf = $('#csrf_token').val()

      console.log('Login... (csrf = ' + csrf + ')')
      client.post({
        url: url.resolve(cozyUrl, '/auth/login'),
        form: {
          passphrase,
          csrf_token: csrf
        }
      }, (err) => {
        if (err) { reject(err) }

        console.log('Load authorization form...')
        client({url: authorizeUrl}, (err, _, body) => {
          if (err) { reject(err) }

          console.log('Parse authorization form...')
          const $ = cheerio.load(body)
          const form = $('form.auth').serializeArray().reduce((data, param) => {
            data[param.name] = param.value
            return data
          }, {})

          console.log('Authorize...')
          client.post({url: authorizeUrl, form}, (err, res, body) => {
            if (err) { reject(err) }

            if (!res.headers.location) {
              return reject(new Error('No redirection after authorize, body = ' + body))
            }

            console.log('Save credentials...')
            client({url: res.headers.location}, (err) => {
              if (err) { reject(err) }

              resolve(cozyUrl)
            })
          })
        })
      })
    })
  })
})

function readAccessToken () {
  console.log('Read access token...')
  return storage.load('creds')
    .then(creds => creds.token.accessToken)
}

function generateTestEnv (accessToken) {
  console.log('Generate .env.test file...')
  fs.writeFileSync('.env.test', `
COZY_STACK_TOKEN=${accessToken}
NODE_ENV=test
  `)
}

automatedRegistration.process(pkg)
  .then(readAccessToken)
  .then(generateTestEnv)
  .catch(console.error)
