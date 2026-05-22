module Window.Onboarding.Context exposing (Context, init, setAddressConfig, setEmailConfig, setFolderConfig, setOAuthConfig, setSyncConfig)

import Data.AddressConfig as AddressConfig exposing (AddressConfig)
import Data.EmailConfig as EmailConfig exposing (EmailConfig)
import Data.OAuthConfig as OAuthConfig exposing (OAuthConfig)
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Data.SyncFolderConfig as SyncFolderConfig exposing (SyncFolderConfig)


type alias Context =
    { platform : String
    , addressConfig : AddressConfig
    , emailConfig : EmailConfig
    , oauthConfig : OAuthConfig
    , folderConfig : SyncFolderConfig
    , syncConfig : SyncConfig
    }


init : String -> String -> Context
init platform defaultSyncPath =
    { platform = platform
    , addressConfig = AddressConfig.init
    , emailConfig = EmailConfig.init
    , oauthConfig = OAuthConfig.init
    , folderConfig = SyncFolderConfig.init defaultSyncPath
    , syncConfig = SyncConfig.init
    }


setAddressConfig : Context -> AddressConfig -> Context
setAddressConfig context addressConfig =
    { context | addressConfig = addressConfig }


setEmailConfig : Context -> EmailConfig -> Context
setEmailConfig context emailConfig =
    { context | emailConfig = emailConfig }


setSyncConfig : Context -> SyncConfig -> Context
setSyncConfig context syncConfig =
    { context | syncConfig = syncConfig }


setFolderConfig : Context -> SyncFolderConfig -> Context
setFolderConfig context folderConfig =
    { context | folderConfig = folderConfig }


setOAuthConfig : Context -> OAuthConfig -> Context
setOAuthConfig context oauthConfig =
    { context | oauthConfig = oauthConfig }
