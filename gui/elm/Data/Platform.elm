module Data.Platform
    exposing
        ( Platform(..)
        , fromName
        )


type Platform
    = Windows
    | Linux
    | Darwin


fromName : String -> Platform
fromName name =
    case name of
        "win32" ->
            Windows

        "darwin" ->
            Darwin

        "linux" ->
            Linux

        unknownPlatform ->
            Debug.log "unknown platform, assuming linux:" unknownPlatform
                |> always Linux
