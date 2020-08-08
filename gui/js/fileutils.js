/** File UI helpers.
 *
 * @module gui/js/fileutils
 */

module.exports.selectIcon = info => {
  if (info.path.endsWith('url')) {
    return 'link'
  } else if (!info.mime) {
    return 'file'
  } else if (info.mime === 'application/pdf') {
    return 'pdf'
  } else if (info.mime === 'application/x-binary') {
    return 'binary'
  } else if (info.mime === 'text/vnd.cozy.note+markdown') {
    return 'cozy-note'
  } else if (info.mime.match(/([/-][bg]?zip2?$|rar|tar|bz2|gz|7z)/)) {
    return 'archive'
  } else if (info.mime.match(/vcard/)) {
    return 'contact'
  } else if (info.mime.match(/^(text|application)\/(html|xml|csv|json)/)) {
    return 'code'
  } else if (info.mime.match(/^text\//)) {
    return 'text'
  } else if (info.mime.match(/^application\/.*rtf/)) {
    return 'text'
  } else if (info.mime.match(/(word|opendocument\.text)/)) {
    return 'text'
  } else if (info.mime.match(/(powerpoint|presentation)/)) {
    return 'presentation'
  } else if (info.mime.match(/(excel|spreadsheet)/)) {
    return 'spreadsheet'
  } else if (['image', 'video'].includes(info.class)) {
    return info.class
  } else if (['music', 'audio'].includes(info.class)) {
    return 'audio'
  }

  return 'file'
}
