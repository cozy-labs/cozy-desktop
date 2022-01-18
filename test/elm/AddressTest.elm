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
                    correctAddress "https://camillenimbus.mycozy.cloud/some-path"
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
            , test "cozy.localhost" <|
                \_ ->
                    correctAddress "http://cozy.localhost:8080"
                        |> Expect.equal "http://cozy.localhost:8080"
            , test "cozy-hosted partner https" <|
                \_ ->
                    correctAddress "https://partner.com"
                        |> Expect.equal "partner.com"
            , test "cozy-hosted partner https with port" <|
                \_ ->
                    correctAddress "https://partner.com:666"
                        |> Expect.equal "partner.com:666"
            , test "cozy-hosted partner http" <|
                \_ ->
                    correctAddress "http://partner.com"
                        |> Expect.equal "http://partner.com"
            , test "cozy-hosted partner nested drive web app url" <|
                \_ ->
                    correctAddress "https://drive.user.partner.com/#/folder"
                        |> Expect.equal "user.partner.com"
            , test "cozy-hosted partner flat drive web app url" <|
                \_ ->
                    correctAddress "https://user-drive.partner.com/"
                        |> Expect.equal "user.partner.com"
            , test "cozy-hosted partner instance full name" <|
                \_ ->
                    correctAddress "user.partner.com"
                        |> Expect.equal "user.partner.com"

            -- , test "localhost" <|
            --     \_ ->
            --         correctAddress "http://localhost:8080"
            --             |> Expect.equal "http://localhost:8080.mycozy.cloud"
            ]
        ]
