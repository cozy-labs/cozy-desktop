module SplitFilenameTest exposing (..)

import Helpers exposing (splitFileName)
import Expect
import Test exposing (..)


suite : Test
suite =
    describe "Helpers"
        [ describe "splitFileName"
            [ test "no extension" <|
                \_ ->
                    splitFileName "basic"
                        |> Expect.equal ( "basic", "" )
            , test "with extension" <|
                \_ ->
                    splitFileName "basic.txt"
                        |> Expect.equal ( "basic", ".txt" )
            , test "with 2 dots" <|
                \_ ->
                    splitFileName "basic.coffee.md"
                        |> Expect.equal ( "basic.coffee", ".md" )
            , test "start with dot" <|
                \_ ->
                    splitFileName ".dotfile"
                        |> Expect.equal ( ".dotfile", "" )
            , test "start with dot and 2 dots" <|
                \_ ->
                    splitFileName ".dotfile.md"
                        |> Expect.equal ( ".dotfile", ".md" )
            ]
        ]
