module DecorationParserTest exposing (suite)

import Expect
import Test exposing (..)
import Util.DecorationParser exposing (DecorationResult(..), findDecorations)


suite : Test
suite =
    describe "Util.DecorationParser"
        [ describe "findDecorations"
            [ test "parses a decorated segment between backticks" <|
                \_ ->
                    findDecorations "Change skipped: a prerequisite change on `/foo` was skipped"
                        |> Expect.equal
                            [ Normal "Change skipped: a prerequisite change on "
                            , Decorated "/foo"
                            , Normal " was skipped"
                            ]
            , test "returns a single Normal segment when there are no backticks" <|
                \_ ->
                    findDecorations "No decoration here"
                        |> Expect.equal [ Normal "No decoration here" ]
            , test "parses multiple decorated segments" <|
                \_ ->
                    findDecorations "`a` and `b`"
                        |> Expect.equal
                            [ Decorated "a"
                            , Normal " and "
                            , Decorated "b"
                            ]
            , test "falls back to a single Normal segment on unbalanced backticks" <|
                \_ ->
                    findDecorations "unbalanced `foo"
                        |> Expect.equal [ Normal "unbalanced `foo" ]
            ]
        ]
