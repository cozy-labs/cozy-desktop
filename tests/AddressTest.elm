module AddressTest exposing (suite)

import Expect
import Test exposing (..)
import Window.Onboarding.Address exposing (correctAddress)


suite : Test
suite =
    describe "Window.Onboarding.Address"
        [ describe "correctAddress"
            [ test "cozy-hosted https" <|
                \_ ->
                    correctAddress "https://camillenimbus.mycozy.cloud"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted https trailing slash" <|
                \_ ->
                    correctAddress "https://camillenimbus.mycozy.cloud/"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted https trailing path" <|
                \_ ->
                    correctAddress "https://camillenimbus.mycozy.cloud/"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted drive web app url" <|
                \_ ->
                    correctAddress "https://camillenimbus-drive.mycozy.cloud/#/folder"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted photos album url" <|
                \_ ->
                    correctAddress "https://camillenimbus-photos.mycozy.cloud/#/albums/68b5cda502ae29f5fa73fd89f1be4f92"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted instance full name" <|
                \_ ->
                    correctAddress "camillenimbus.mycozy.cloud"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted instance short name" <|
                \_ ->
                    correctAddress "camillenimbus"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted app name" <|
                \_ ->
                    correctAddress "camillenimbus-drive.mycozy.cloud"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "self-hosted https" <|
                \_ ->
                    correctAddress "https://camillenimbus.com"
                        |> Expect.equal "camillenimbus.com"
            , test "self-hosted with dash" <|
                \_ ->
                    correctAddress "https://camille-nimbus.com"
                        |> Expect.equal "camille-nimbus.com"
            , test "self-hosted http" <|
                \_ ->
                    correctAddress "http://camille-nimbus.com"
                        |> Expect.equal "http://camille-nimbus.com"
            , test "cozy.tools" <|
                \_ ->
                    correctAddress "http://cozy.tools:8080"
                        |> Expect.equal "http://cozy.tools:8080"

            -- , test "localhost" <|
            --     \_ ->
            --         correctAddress "http://localhost:8080"
            --             |> Expect.equal "http://localhost:8080.mycozy.cloud"
            ]
        ]
