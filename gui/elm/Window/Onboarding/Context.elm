module Window.Onboarding.Context exposing (Context, init, setAddressConfig, setFolderConfig, setSyncConfig)

import Data.AddressConfig as AddressConfig exposing (AddressConfig)
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Data.SyncFolderConfig as SyncFolderConfig exposing (SyncFolderConfig)
import Url exposing (Url)


type alias Context =
    { platform : String
    , addressConfig : AddressConfig
    , folderConfig : SyncFolderConfig
    , syncConfig : SyncConfig
    }


init : String -> String -> Context
init platform defaultSyncPath =
    { platform = platform
    , addressConfig = AddressConfig.init
    , folderConfig = SyncFolderConfig.init defaultSyncPath
    , syncConfig = SyncConfig.init
    }


setAddressConfig : Context -> AddressConfig -> Context
setAddressConfig context addressConfig =
    { context | addressConfig = addressConfig }


setSyncConfig : Context -> SyncConfig -> Context
setSyncConfig context syncConfig =
    { context | syncConfig = syncConfig }


setFolderConfig : Context -> SyncFolderConfig -> Context
setFolderConfig context folderConfig =
    { context | folderConfig = folderConfig }
