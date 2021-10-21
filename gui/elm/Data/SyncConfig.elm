port module Data.SyncConfig exposing (SyncConfig, gotSyncConfig, init)

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
