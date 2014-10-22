# Set of components to make the react template building easier.

{div, p, img, span, a, label, input, h1, h2, button} = React.DOM

Line = React.createClass

    render: ->
        className = @props.className
        className ?= 'mtl'
        div className: "line clearfix #{className}", @props.children


Container = React.createClass

    render: ->
        className = 'container '
        className += @props.className if @props.className
        div className: className, @props.children


Title = React.createClass

    render: ->
        h1 {}, @props.text


Subtitle = React.createClass

    render: ->
        h2 {}, @props.text


Button = React.createClass

    render: ->
        button
            className: "btn btn-cozy #{@props.className}"
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
                className: "mt1 #{@props.fieldClass}"
                ref: @props.inputRef
                defaultValue: @props.defaultValue
                onChange: @onChange
                onKeyUp: @props.onKeyUp
                placeholder: @props.placeholder
                id: @props.inputId

            p className: 'error', @state.error if @state.error

    getValue: ->
        @refs[@props.inputRef].getDOMNode().value

    isValid: ->
        @getValue() isnt ''

    getError: ->
        'value is missing'

    onChange: ->
        val = @refs[@props.inputRef].getDOMNode().value
        if val is ''
            @setState error: t @getError()
        else
            @setState error: null
        @props.onChange()


InfoLine = React.createClass

    render: ->
        if @props.link?
            value = span null,
                a
                    href: "#{@props.link.type}://#{@props.value}"
                , @props.value
        else
            value = span null,  @props.value

        Line className: 'line mts',
            span className: 'mod w100p left', "#{@props.label}:"
            span className: 'mod left', value
