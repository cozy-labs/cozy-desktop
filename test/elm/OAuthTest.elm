module OAuthTest exposing (suite)

import Expect
import Test exposing (..)
import Window.Onboarding.Context as Context
import Window.Onboarding.OAuth as OAuth


suite : Test
suite =
    describe "Window.Onboarding.OAuth"
        [ describe "OpenBrowser"
            [ test "opens the browser and marks it as opened" <|
                \_ ->
                    OAuth.update OAuth.OpenBrowser (Context.init "linux" "/tmp/cozy")
                        |> Tuple.first
                        |> .oauthConfig
                        |> .browserOpened
                        |> Expect.equal True
            , test "does not open the browser twice" <|
                \_ ->
                    let
                        ( opened, _ ) =
                            OAuth.update OAuth.OpenBrowser (Context.init "linux" "/tmp/cozy")
                    in
                    OAuth.update OAuth.OpenBrowser opened
                        |> Tuple.first
                        |> Expect.equal opened
            , test "StartOAuth marks the browser as opened" <|
                \_ ->
                    OAuth.update OAuth.StartOAuth (Context.init "linux" "/tmp/cozy")
                        |> Tuple.first
                        |> .oauthConfig
                        |> .browserOpened
                        |> Expect.equal True
            ]
        ]
