/** File UI helpers.
 *
 * @module gui/js/fileutils
 */

module.exports.selectIcon = info => {
  if (!info.mime) {
    return 'file'
  } else if (info.mime === 'application/pdf') {
    return 'pdf'
  } else if (info.mime === 'application/x-binary') {
    return 'binary'
  } else if (info.mime === 'text/vnd.cozy.note+markdown') {
    return 'cozy-note'
  } else if (info.mime.match(/[/-][bg]?zip2?$/)) {
    return 'archive'
  } else if (info.mime.match(/^(text|application)\/(html|xml)/)) {
    return 'code'
  } else if (info.mime.match(/^text\//)) {
    return 'text'
  } else if (info.mime.match(/^application\/.*rtf/)) {
    return 'text'
  } else if (info.mime.match(/word/)) {
    return 'text'
  } else if (info.mime.match(/powerpoint/)) {
    return 'presentation'
  } else if (info.mime.match(/excel/)) {
    return 'spreadsheet'
  } else if (['image', 'video'].includes(info.class)) {
    return info.class
  } else if (['music', 'audio'].includes(info.class)) {
    return 'audio'
  }

  return 'file'
}
