path = require 'path'

exports.config =
    modules:
        definition: false
        wrapper: false
    files:
        javascripts:
            joinTo:
                'javascripts/app.js': /^app/
                'javascripts/vendor.js': /^vendor/
            order:
                # Files in `vendor` directories are compiled before other files
                # even if they aren't specified in order.
                before: [
                    'vendor/scripts/events.js'
                    'vendor/scripts/react-with-addons.js'
                    'vendor/scripts/jquery.js'
                    'vendor/scripts/underscore.js'
                    'vendor/scripts/backbone.js'
                    'vendor/scripts/superagent.js'
                    'vendor/scripts/bootstrap-3.1.1.min.js'
                    'vendor/scripts/moment.js'
                    'vendor/scripts/polyglot.js'
                ]
                after: [
                    'app/initialize.coffee'
                ]

        stylesheets:
            joinTo: 'stylesheets/app.css'
            order:
                before: ['vendor/styles/normalize.css']
                after: ['vendor/styles/helpers.css']

        templates:
            defaultExtension: 'jade'
            joinTo: 'javascripts/app.js'

    plugins:
        jade:
            globals: ['t', 'moment']
            pretty: yes

        cleancss:
            keepSpecialComments: 0
            removeEmpty: true

        digest:
            referenceFiles: /\.jade$/

    overrides:
        production:
            # re-enable when uglifyjs will handle properly in source maps
            # with sourcesContent attribute
            #optimize: true
            sourceMaps: true
            paths:
                public: path.resolve __dirname, '../build/client/public'
