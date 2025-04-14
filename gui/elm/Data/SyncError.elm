module Data.SyncError exposing
    ( EncodedSyncError
    , SyncError(..)
    , decode
    , decodeLatest
    , message
    )


type SyncError
    = TwakeNotFound
    | OAuthClientRevoked
    | MissingPermissions
    | None
    | SynchronizationImpossible


type alias EncodedSyncError =
    { name : String
    , code : String
    }


decode : EncodedSyncError -> SyncError
decode { name, code } =
    case code of
        "TwakeNotFound" ->
            TwakeNotFound

        "OAuthClientRevoked" ->
            OAuthClientRevoked

        "MissingPermissions" ->
            MissingPermissions

        _ ->
            SynchronizationImpossible


decodeLatest : List EncodedSyncError -> SyncError
decodeLatest errors =
    List.reverse errors
        |> List.head
        |> Maybe.map decode
        |> Maybe.withDefault None


message : SyncError -> String
message error =
    case error of
        TwakeNotFound ->
            "Error Your Twake Workplace could not be found"

        OAuthClientRevoked ->
            "Your Twake Desktop authorizations have been revoked"

        MissingPermissions ->
            "Dashboard Synchronization impossible"

        None ->
            ""

        SynchronizationImpossible ->
            "Dashboard Synchronization impossible"
