module Data.Path exposing
    ( Path
    , fromString
    , isRoot
    , name
    , parent
    , toString
    )

import Data.Platform exposing (Platform(..))


type alias PathSeparator =
    String


sep : Platform -> PathSeparator
sep platform =
    case platform of
        Windows ->
            "\\"

        Linux ->
            "/"

        Darwin ->
            "/"


type alias Path =
    { platform : Platform, members : List String }


parent : Path -> Path
parent path =
    let
        { platform, members } =
            path
    in
    Path platform (List.take (List.length members - 1) members)


isRoot : Path -> Bool
isRoot path =
    List.length path.members == 0


name : Path -> String
name { members } =
    members
        |> List.reverse
        |> List.head
        |> Maybe.withDefault ""


fromString : Platform -> String -> Path
fromString platform str =
    let
        members =
            String.split (sep platform) str
                |> List.filter (not << String.isEmpty)
    in
    Path platform members


toString : Path -> String
toString path =
    let
        { platform, members } =
            path

        separator =
            sep platform
    in
    separator ++ String.join separator members
