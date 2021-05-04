const React = require('react')
const ReactDOM = require('react-dom')
const PropTypes = require('prop-types')
const e = React.createElement

const em = content =>
  e('span', { className: 'u-bg-frenchPass u-bdrs-4 u-ph-half u-pv-0' }, content)

const Details = props => {
  const { translate, interpolate } = props

  return e('div', { className: 'details' }, [
    e('header', { className: 'details__header' }, [
      e(
        'h1',
        null,
        translate('InvalidDoc Naming rules for each Operating System')
      )
    ]),
    e('h2', null, translate('InvalidDoc Windows restrictions')),
    e('ul', null, [
      e(
        'li',
        { key: 'nameLength' },
        translate(
          'InvalidDoc File names, extension included, cannot be more than 256 characters long.'
        )
      ),
      e(
        'li',
        { key: 'dirNameLength' },
        translate(
          'InvalidDoc Folder names cannot be more than 243 characters long.'
        )
      ),
      e(
        'li',
        { key: 'pathLength' },
        interpolate(
          translate(
            "InvalidDoc Document paths (i.e. document name + all its ancestors' names) cannot be more than {0} characters long."
          ),
          32766
        )
      ),
      e('li', { key: 'reservedChars' }, [
        translate(
          'InvalidDoc Document names cannot include the following characters: '
        ),
        em('<'),
        ', ',
        em('>'),
        ', ',
        em(':'),
        ', ',
        em('"'),
        ', ',
        em('/'),
        ', ',
        em('\\'),
        ', ',
        em('|'),
        ', ',
        em('?'),
        ', ',
        em('*')
      ]),
      e('li', { key: 'forbiddenLastChars' }, [
        translate(
          'InvalidDoc Folder names and file extensions cannot end with the following characters: '
        ),
        em('.'),
        ', ',
        em(' ')
      ]),
      e('li', { key: 'reservedNames' }, [
        translate('InvalidDoc The following document names are forbidden: '),
        em('CON'),
        ', ',
        em('PRN'),
        ', ',
        em('AUX'),
        ', ',
        em('NUL'),
        ', ',
        em('COM1'),
        ', ',
        em('COM2'),
        ', ',
        em('COM3'),
        ', ',
        em('COM4'),
        ', ',
        em('COM5'),
        ', ',
        em('COM6'),
        ', ',
        em('COM7'),
        ', ',
        em('COM8'),
        ', ',
        em('COM9'),
        ', ',
        em('LPT1'),
        ', ',
        em('LPT2'),
        ', ',
        em('LPT3'),
        ', ',
        em('LPT4'),
        ', ',
        em('LPT5'),
        ', ',
        em('LPT6'),
        ', ',
        em('LPT7'),
        ', ',
        em('LPT8'),
        ', ',
        em('LPT9')
      ])
    ]),
    e('h2', null, translate('InvalidDoc macOS restrictions')),
    e('ul', null, [
      e(
        'li',
        { key: 'nameLength' },
        interpolate(
          translate(
            'InvalidDoc Document names, extension included, cannot be more than {0} characters long.'
          ),
          255
        )
      ),
      e(
        'li',
        { key: 'pathLength' },
        interpolate(
          translate(
            "InvalidDoc Document paths (i.e. document name + all its ancestors' names) cannot be more than {0} characters long."
          ),
          1023
        )
      ),
      e('li', { key: 'reservedChars' }, [
        translate(
          'InvalidDoc Document names cannot include the following characters: '
        ),
        em('/')
      ])
    ]),
    e('h2', null, translate('InvalidDoc Linux restrictions')),
    e('ul', null, [
      e(
        'li',
        { key: 'nameLength' },
        interpolate(
          translate(
            'InvalidDoc Document names, extension included, cannot be more than {0} characters long.'
          ),
          255
        )
      ),
      e(
        'li',
        { key: 'pathLength' },
        interpolate(
          translate(
            "InvalidDoc Document paths (i.e. document name + all its ancestors' names) cannot be more than {0} characters long."
          ),
          4095
        )
      ),
      e('li', { key: 'reservedChars' }, [
        translate(
          'InvalidDoc Document names cannot include the following characters: '
        ),
        em('/')
      ])
    ])
  ])
}
Details.propTypes = {
  translate: PropTypes.func.isRequired,
  interpolate: PropTypes.func.isRequired
}

require('electron').ipcRenderer.on(
  'load-content',
  (event, { translations }) => {
    const translate = key =>
      translations[key] || key.substr(key.indexOf(' ') + 1) // Key without prefix
    const interpolate = (string, ...args) => {
      return string.replace(/{(\d+)}/g, (_, index) => args[parseInt(index)])
    }

    ReactDOM.render(
      e(React.Fragment, null, [e(Details, { translate, interpolate }, null)]),
      document.getElementById('container')
    )
  }
)
