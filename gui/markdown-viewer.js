const React = require('react')
const ReactDOM = require('react-dom')
const ReactMarkdown = require('react-markdown')
const PropTypes = require('prop-types')
const e = React.createElement

class Banner extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      closed: false
    }

    this.close = this.close.bind(this)
  }

  close() {
    this.setState({ closed: true })
  }

  render() {
    const { translate, level, title, details } = this.props
    const { closed } = this.state
    const className = closed
      ? `banner banner--${level} banner--closed`
      : `banner banner--${level}`

    return e('div', { className }, [
      e('div', { className: 'banner__main' }, [
        e(
          'span',
          { className: 'banner__main-title' },
          translate('MarkdownViewer Why do I see this?')
        ),
        e('span', { className: 'banner__error-title' }, title)
      ]),
      e('p', { className: 'banner__error-details' }, details),
      e(
        'div',
        {
          className: 'banner__close',
          onClick: this.close
        },
        '\u2715'
      )
    ])
  }
}
Banner.propTypes = {
  translate: PropTypes.func.isRequired,
  level: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  details: PropTypes.string.isRequired
}

const MarkdownViewer = props => {
  const { content: source, filename } = props

  return e('div', { className: 'markdown-viewer' }, [
    e('header', { className: 'markdown-viewer__filename' }, [
      e('h1', null, filename)
    ]),
    e(ReactMarkdown, { source }, null)
  ])
}

require('electron').ipcRenderer.on(
  'load-content',
  (event, { translations, banner, content, filename }) => {
    const translate = key =>
      translations[key] || key.substr(key.indexOf(' ') + 1) // Key without prefix

    ReactDOM.render(
      e(React.Fragment, null, [
        e(Banner, { ...banner, translate }, null),
        e(MarkdownViewer, { content, filename }, null)
      ]),
      document.getElementById('container')
    )
  }
)
