port module Data.SyncConfig exposing (SyncConfig, buildAppUrl, gotSyncConfig, init)

import Url exposing (Url)


type alias SyncConfig =
    { address : Maybe Url
    , capabilities :
        { flatSubdomains : Bool
        }
    , deviceId : String
    , deviceName : String
    , flags :
        { partialSyncEnabled : Bool
        }
    }


init : SyncConfig
init =
    { address = Nothing
    , capabilities =
        { flatSubdomains = True
        }
    , deviceId = ""
    , deviceName = ""
    , flags =
        { partialSyncEnabled = False
        }
    }


type alias AppSlug =
    String


buildAppUrl : SyncConfig -> AppSlug -> Maybe Url
buildAppUrl { address, capabilities } slug =
    let
        twakeName =
            case address of
                Just url ->
                    String.split "." url.host
                        |> List.head
                        |> Maybe.withDefault ""

                _ ->
                    ""

        host =
            case ( address, capabilities.flatSubdomains ) of
                ( Just url, True ) ->
                    String.replace twakeName (twakeName ++ "-" ++ slug) url.host

                ( Just url, False ) ->
                    String.join "." [ slug, url.host ]

                ( _, _ ) ->
                    ""
    in
    Maybe.map
        (\url ->
            { protocol = url.protocol
            , host = host
            , port_ = url.port_
            , path = ""
            , query = Nothing
            , fragment = Nothing
            }
        )
        address



-- Communicate through ports


port syncConfig : (EncodedSyncConfig -> msg) -> Sub msg


gotSyncConfig : (SyncConfig -> msg) -> Sub msg
gotSyncConfig msg =
    syncConfig (msg << decode)


type alias EncodedSyncConfig =
    { address : String
    , capabilities :
        { flatSubdomains : Bool
        }
    , deviceId : String
    , deviceName : String
    , flags :
        { partialSyncEnabled : Bool
        }
    }


decode : EncodedSyncConfig -> SyncConfig
decode { address, capabilities, deviceId, deviceName, flags } =
    { address = Url.fromString address
    , capabilities = capabilities
    , deviceId = deviceId
    , deviceName = deviceName
    , flags = flags
    }
