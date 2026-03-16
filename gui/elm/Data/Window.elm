module Data.Window exposing
    ( Window(..)
    , fromHash
    )


type Window
    = Help
    | Onboarding
    | Tray
    | Updater
    | SelectCertificate


fromHash : String -> Window
fromHash hash =
    case hash of
        "#onboarding" ->
            Onboarding

        "#help" ->
            Help

        "#tray" ->
            Tray

        "#updater" ->
            Updater

        "#select-certificate" ->
            SelectCertificate

        -- Temporarily use the MsgMechanism to
        -- get to the 2Panes page.
        _ ->
            Debug.log "Window.fromHash: Unknown window (falling back to Onboarding)" hash
                |> always Onboarding
