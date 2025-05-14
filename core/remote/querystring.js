const { pickBy } = require('lodash')

/**
 * Encode a value of any type into a URI search param compatible string with a specific treatment for arrays which will keep their brackets (they do not with standard `toString()` method).
 *
 * Examples:
 *
 *   encodeValues([['io.cozy.files', 'abcd1234'], '12345'])
 *   // → '[[%22io.cozy.files%22,%22abcd1234%22],%2212345%22]'
 *
 *   encodeValues([['io.cozy.files', 'abcd1234'], '12345'].toString(), true)
 *   // → '%22io.cozy.files%2Cabcd1234%2C12345%22'
 *
 *   encodeValues([['io.cozy.files', 'abcd1234'], '12345'].toString(), false)
 *   // → 'io.cozy.files%2Cabcd1234%2C12345'
 *
 *   encodeValues('[1234]')
 *   // → %5B1234%5D
 *
 * @function
 * @private
 */
const encodeValues = (values, fromArray = false) => {
  if (Array.isArray(values)) {
    return '[' + values.map(v => encodeValues(v, true)).join(',') + ']'
  }
  return fromArray
    ? encodeURIComponent(`"${values}"`)
    : encodeURIComponent(values)
}

/**
 * Encode an object as querystring, values are encoded as
 * URI components, keys are not.
 *
 * @function
 * @private
 */
const encode = data => {
  return Object.entries(data)
    .map(([k, v]) => {
      const encodedValue = encodeValues(v)
      return `${k}=${encodedValue}`
    })
    .join('&')
}

/**
 * Returns a URL from base url and a query parameter object.
 * Any undefined parameter is removed.
 *
 * @function
 * @private
 */
const buildURL = (url, params) => {
  const qs = encode(pickBy(params))
  if (qs) {
    return `${url}?${qs}`
  } else {
    return url
  }
}

module.exports = {
  encode,
  buildURL
}
