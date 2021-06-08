{-
   XXX: UserAlert ports are defined in the Data.UserAlert module.
   We should progressively migrate to this pattern to simplify usage of ports
   and avoid circular dependencies.
-}


port module Ports exposing
    ( autoLauncher
    , autolaunch
    , cancelUnlink
    , chooseFolder
    , closeApp
    , focus
    , folder
    , folderError
    , gotocozy
    , gotofolder
    , gototab
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
    , unlinkCozy
    )

import Data.File exposing (EncodedFile)
import Data.SyncFolderConfig exposing (SyncFolderConfig)


port autoLauncher : Bool -> Cmd msg


port autolaunch : (Bool -> msg) -> Sub msg


port cancelUnlink : (Bool -> msg) -> Sub msg


port chooseFolder : () -> Cmd msg


port closeApp : () -> Cmd msg


port focus : String -> Cmd msg


port folder : (SyncFolderConfig -> msg) -> Sub msg


port folderError : (String -> msg) -> Sub msg


port gotocozy : Bool -> Cmd msg


port gotofolder : () -> Cmd msg


port gototab : (String -> msg) -> Sub msg


port mail : (Maybe String -> msg) -> Sub msg


port newRelease : (( String, String ) -> msg) -> Sub msg


port openFile : String -> Cmd msg


port showInParent : String -> Cmd msg


port quitAndInstall : () -> Cmd msg


port registerRemote : String -> Cmd msg


port registrationError : (String -> msg) -> Sub msg


port remove : (EncodedFile -> msg) -> Sub msg


port sendMail : String -> Cmd msg


port showHelp : () -> Cmd msg


port startSync : String -> Cmd msg


port transfer : (EncodedFile -> msg) -> Sub msg


port unlinkCozy : () -> Cmd msg


port reinitializeSynchronization : () -> Cmd msg


port reinitialization : (String -> msg) -> Sub msg


port manualStartSync : () -> Cmd msg
