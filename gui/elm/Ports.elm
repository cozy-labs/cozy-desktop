{-
   XXX: UserAlert ports are defined in the Data.UserAlert module.
   We should progressively migrate to this pattern to simplify usage of ports
   and avoid circular dependencies.
-}


port module Ports exposing
    ( autoLauncher
    , autolaunch
    , chooseFolder
    , closeApp
    , focus
    , folder
    , folderError
    , gotofolder
    , gototab
    , gototwake
    , mail
    , manualStartSync
    , newRelease
    , openFile
    , quitAndInstall
    , registerRemote
    , registrationError
    , reinitialization
    , reinitializeSynchronization
    , remove
    , sendMail
    , showHelp
    , showInParent
    , startSync
    , transfer
    , unlinkTwake
    )

import Data.File exposing (EncodedFile)
import Data.SyncFolderConfig exposing (SyncFolderConfig)


port autoLauncher : Bool -> Cmd msg


port autolaunch : (Bool -> msg) -> Sub msg


port chooseFolder : () -> Cmd msg


port closeApp : () -> Cmd msg


port focus : String -> Cmd msg


port folder : (SyncFolderConfig -> msg) -> Sub msg


port folderError : (String -> msg) -> Sub msg


port gototwake : Bool -> Cmd msg


port gotofolder : Bool -> Cmd msg


port gototab : (String -> msg) -> Sub msg


port mail : (Maybe String -> msg) -> Sub msg


port newRelease : (( String, String ) -> msg) -> Sub msg


port openFile : ( String, Bool ) -> Cmd msg


port showInParent : ( String, Bool ) -> Cmd msg


port quitAndInstall : () -> Cmd msg


port registerRemote : String -> Cmd msg


port registrationError : (String -> msg) -> Sub msg


port remove : (EncodedFile -> msg) -> Sub msg


port sendMail : String -> Cmd msg


port showHelp : () -> Cmd msg


port startSync : String -> Cmd msg


port transfer : (EncodedFile -> msg) -> Sub msg


port unlinkTwake : () -> Cmd msg


port reinitializeSynchronization : () -> Cmd msg


port reinitialization : (String -> msg) -> Sub msg


port manualStartSync : () -> Cmd msg
