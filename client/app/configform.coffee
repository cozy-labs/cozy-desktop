ConfigForm = React.createClass
    render: ->
      div className: 'container',
          h1 {}, 'Cozy Files Configuration'
          div className: 'line device-name',
              label className: 'mod left w25 mr2 ml2', t 'your device name'
              input
                  className: 'mod left w75 mt1'
                  ref: 'deviceName'
                  defaultValue: @props.deviceName
          div className: 'line mt2',
              button
                  className: 'mod right btn btn-cozy'
                  ref: 'saveButton'
                  onClick: @onSaveButtonClicked
              , 'Save changes'

    onSaveButtonClicked: ->
        @props.deviceName = @refs.deviceName.getDOMNode().value

        configHelpers.saveConfigSync @props
        alert 'Config saved'
