{-
   XXX: UserAction ports are defined in the Data.UserAction module.
   We should progressively migrate to this pattern to simplify usage of ports
   and avoid circular dependencies.
-}


port module Ports exposing
    ( autoLauncher
    , autolaunch
    , cancelUnlink
    , chooseFolder
    , closeApp
    , diskSpace
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
    , remove
    , sendMail
    , showHelp
    , showInParent
    , startSync
    , transfer
    , unlinkCozy
    , updateDownloading
    , updateError
    )

import Data.DiskSpace exposing (DiskSpace)
import Data.File exposing (EncodedFile)
import Data.Progress exposing (Progress)
import Data.SyncFolderConfig exposing (SyncFolderConfig)


port autoLauncher : Bool -> Cmd msg


port autolaunch : (Bool -> msg) -> Sub msg


port cancelUnlink : (Bool -> msg) -> Sub msg


port chooseFolder : () -> Cmd msg


port closeApp : () -> Cmd msg


port diskSpace : (DiskSpace -> msg) -> Sub msg


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


port updateDownloading : (Maybe Progress -> msg) -> Sub msg


port updateError : (String -> msg) -> Sub msg


port manualStartSync : () -> Cmd msg
