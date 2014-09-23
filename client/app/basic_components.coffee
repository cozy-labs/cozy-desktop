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


Subtitle = React.createClass
    render: ->
        h2 {}, @props.text


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
        @getValue() isnt ''

    onChange: ->
        val = @refs[@props.inputRef].getDOMNode().value
        if val is ''
            @setState error: 'value is missing'
        else
            @setState error: null


InfoLine = React.createClass

    render: ->
        if @props.link?
            value = span null,
                a href: "#{@props.link.type}://#{@props.value}", @props.value
        else
            value = span null,  @props.value
        Line null,
            span className: 'mrm', @props.label
            value
