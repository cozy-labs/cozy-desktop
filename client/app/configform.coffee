ConfigForm = React.createClass
    render: ->
      div className: 'container',
          h1 {}, 'Cozy Files Configuration'
          div className: 'line device-name',
              label className: 'mod left w25 mr2 ml2', t 'your device name'
              input className: 'mod left w75 mt2', ref: 'device-name', defaultValue: @props.deviceName, onChange: @onChange

    onChange: ->
        @setState deviceName: @refs['device-name'].getDOMNode().value
        console.log @props
