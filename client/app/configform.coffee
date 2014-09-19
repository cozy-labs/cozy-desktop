ReactCSSTransitionGroup = React.addons.CSSTransitionGroup


isValidForm = (fields) ->
    for field in fields
        unless field.isValid()
            return false
    true


Line = React.createClass
    render: ->
        div className: 'line mtl clearfix', @props.children


Container = React.createClass
    render: ->
        ReactCSSTransitionGroup transitionName: "slide", component: div,
            div className: 'container', @props.children


Title = React.createClass
    render: ->
            h1 {}, @props.text

Button = React.createClass
    render: ->
        button
            className: 'btn btn-cozy ' + @props.className
            ref: @props.ref
            onClick: @props.onClick
        , @props.text


Field = React.createClass

    getInitialState: ->
        error: null

    render: ->
        @props.type ?= 'text'
        Line null,
            label className: 'mod w100 mrm', @props.label
            input
                type: @props.type
                className: 'mt1 ' + @props.fieldClass
                ref: @props.inputRef
                defaultValue: @props.defaultValue
                onChange: @onChange
                placeholder: @props.placeholder
            if @state.error
                p null, @state.error

    getValue: ->
        @refs[@props.inputRef].getDOMNode().value

    isValid: ->
        console.log @getValue()
        @getValue() isnt ''

    onChange: ->
        val = @refs[@props.inputRef].getDOMNode().value
        if val is ''
            @setState error: 'value is missing'
        else
            @setState error: null


Intro = React.createClass

    render: ->
        Container null,
           div className: 'txtcenter mtl',
               img
                   src: 'client/public/icon/bighappycloud.png'
               p className: 'mtl', 'welcome to the cozy data proxy'
               Button
                    className: 'mtl txtbigger pam'
                    onClick: @onEnterClicked
                    text: t 'start configuring your device and sync it with your cozy'

    onEnterClicked: ->
        db = require './backend/db'
        console.log db
        renderState 'STEP1'


ConfigFormStepOne = React.createClass
    render: ->
        Container null,
            Title text: t 'cozy files configuration 1 on 3'
            Field
                label: t 'your device name'
                fieldClass: 'w300p'
                inputRef: 'deviceName'
                defaultValue: @props.deviceName
                ref: 'deviceNameField'
                placeholder: 'Laptop'
            Field
                label: t 'directory to synchronize your data'
                fieldClass: 'w500p'
                inputRef: 'path'
                defaultValue: @props.path
                ref: 'devicePathField'
                placeholder: '/home/john/mycozyfolder'
            Line null,
                Button
                    className: 'right'
                    onClick: @onSaveButtonClicked
                    text: t 'save your device information and go to step 2'

    onSaveButtonClicked: ->
        fieldName = @refs.deviceNameField
        fieldPath = @refs.devicePathField
        isValid = isValidForm [fieldName, fieldPath]
        if isValid
            configHelpers.saveConfigSync
                deviceName: fieldName.getValue()
                path: fieldPath.getValue()
            renderState 'STEP2'
        else
            alert 'a value is missing'


ConfigFormStepTwo = React.createClass
    render: ->
        Container null,
            Title text: t 'cozy files configuration 2 on 3'
            Field
                label: t 'your remote url'
                fieldClass: 'w300p'
                inputRef: 'remoteUrl'
                defaultValue: @props.url
                ref: 'remoteUrlField'
                placeholder: 'john.cozycloud.cc'
            Field
                label: t 'your remote password'
                fieldClass: 'w300p'
                type: 'password'
                inputRef: 'remotePassword'
                defaultValue: @props.remotePassword
                ref: 'remotePasswordField'
            Line null,
                Button
                    className: 'left'
                    ref: 'backButton'
                    onClick: @onBackButtonClicked
                    text: t 'go back to previous step'
                Button
                    className: 'right'
                    ref: 'nextButton'
                    onClick: @onSaveButtonClicked
                    text: t 'register device and synchronize'

    onBackButtonClicked: ->
        renderState 'STEP1'

    onSaveButtonClicked: ->
        fieldUrl = @refs.remoteUrlField
        fieldPassword = @refs.remotePasswordField
        isValid = isValidForm [fieldUrl, fieldPassword]
        if isValid
            configHelpers.saveConfigSync
                url: fieldUrl.getValue()
            # TODO Register to remote Cozy
            renderState 'STEP3'
        else
            alert 'a value is missing'


ConfigFormStepThree = React.createClass
    render: ->
      div className: 'container',
          h1 {}, 'Cozy Files Configuration (3/3)'
          h2 {}, 'Run replications...'
          div className: 'line device-name',


StateView = React.createClass
    render: ->
      div className: 'container',
          h1 {}, 'Cozy Files'
