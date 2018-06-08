module Data.File
    exposing
        ( File
        , splitName
        )

import Time exposing (Time)


type alias File =
    { filename : String
    , icon : String
    , path : String
    , size : Int
    , updated : Time
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
            ( (String.join "." (List.reverse rest)), "." ++ ext )
