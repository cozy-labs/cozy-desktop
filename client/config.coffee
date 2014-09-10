path = require 'path'
exports.config =

    files:
        javascripts:
            joinTo:
                'javascripts/app.js': /^app/
                'javascripts/vendor.js': /^vendor/
            order:
                # Files in `vendor` directories are compiled before other files
                # even if they aren't specified in order.
                before: [
                    'vendor/scripts/jquery-1.9.1.js'
                    'vendor/scripts/underscore-1.4.4.js'
                    'vendor/scripts/backbone-1.0.0.js'
                    'vendor/scripts/spin.js'
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
            globals: ['t', 'moment', 'filesize']

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
