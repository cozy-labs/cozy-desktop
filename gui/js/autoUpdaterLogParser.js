const autoUpdaterLogParser = msg => {
  const initMatch = /Full: ([\d,.]+) ([GMKB]+), To download: ([\d,.]+) ([GMKB]+)/.exec(
    msg.data[0]
  )
  if (initMatch) {
    const size = Number(initMatch[3].split(',').join(''))
    const unit = initMatch[4]

    return {
      totalSize: sizeParser(size, unit)
    }
  }

  const downloadMatch = /download range: bytes=(\d+)-(\d+)/.exec(msg.data[0])
  if (downloadMatch) {
    return {
      chunkStart: Number(downloadMatch[1])
    }
  }
}

const sizeParser = (value /*: number */, unit /*: string */) => {
  switch (unit) {
    case 'KB':
      return value * 1024
    case 'MB':
      return value * 1024 * 1024
    case 'GB':
      return value * 1024 * 1024 * 1024
    default:
      return value
  }
}

module.exports = {
  autoUpdaterLogParser
}
