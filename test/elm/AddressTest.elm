module AddressTest exposing (..)

import Address exposing (correctAddress)
import Expect
import Test exposing (..)


suite : Test
suite =
    describe "Address"
        [ describe "correctAddress"
            [ test "cozy-hosted https" <|
                \_ ->
                    correctAddress "https://camillenimbus.mycozy.cloud"
                        |> Expect.equal "camillenimbus.mycozy.cloud"
            , test "cozy-hosted https trailing slash" <|
                \_ ->
                    correctAddress "https://camillenimbus.mycozy.cloud/"
                        |> Expect.equal "camillenimbus.mycozy.cloud/"

            -- , test "cozy-hosted https trailing path" <|
            --     \_ ->
            --         correctAddress "https://camillenimbus.mycozy.cloud/#/folder"
            --             |> Expect.equal "camillenimbus.mycozy.cloud/#/folder"
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
