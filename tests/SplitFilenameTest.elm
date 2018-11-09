module SplitFilenameTest exposing (suite)

import Data.File as File
import Expect
import Test exposing (..)


suite : Test
suite =
    describe "Helpers"
        [ describe "File.splitName"
            [ test "no extension" <|
                \_ ->
                    File.splitName "basic"
                        |> Expect.equal ( "basic", "" )
            , test "with extension" <|
                \_ ->
                    File.splitName "basic.txt"
                        |> Expect.equal ( "basic", ".txt" )
            , test "with 2 dots" <|
                \_ ->
                    File.splitName "basic.coffee.md"
                        |> Expect.equal ( "basic.coffee", ".md" )
            , test "start with dot" <|
                \_ ->
                    File.splitName ".dotfile"
                        |> Expect.equal ( ".dotfile", "" )
            , test "start with dot and 2 dots" <|
                \_ ->
                    File.splitName ".dotfile.md"
                        |> Expect.equal ( ".dotfile", ".md" )
            ]
        ]
