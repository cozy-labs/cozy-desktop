module Data.File exposing
    ( EncodedFile
    , File
    , decode
    , samePath
    , splitName
    )

import Data.Bytes as Bytes
import Data.Path as Path exposing (Path)
import Data.Platform as Platform exposing (Platform)
import Data.Progress exposing (Progress)
import Time



-- File type and helpers


type alias File =
    { filename : String
    , icon : String
    , path : Path
    , updated : Time.Posix
    , progress : Progress
    }


splitName : String -> ( String, String )
splitName filename =
    case List.reverse (String.split "." filename) of
        [] ->
            ( "", "" )

        [ rest ] ->
            ( rest, "" )

        [ ext, rest ] ->
            if rest == "" then
                ( "." ++ ext, "" )

            else
                ( rest, "." ++ ext )

        ext :: rest ->
            ( String.join "." (List.reverse rest), "." ++ ext )


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


type alias EncodedFile =
    { filename : String
    , icon : String
    , path : String
    , size : Int
    , updated : Int
    , transferred : Int
    }


decode : Platform -> EncodedFile -> File
decode platform encoded =
    let
        { filename, icon, path, size, transferred } =
            encoded

        posixTime =
            Time.millisToPosix encoded.updated
    in
    { filename = filename
    , icon = icon
    , path = Path.fromString platform path
    , updated = posixTime
    , progress = Progress (Bytes.fromInt size) (Bytes.fromInt transferred)
    }
