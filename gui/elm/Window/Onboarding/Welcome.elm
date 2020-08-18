module Window.Onboarding.Welcome exposing
    ( Msg(..)
    , view
    )

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons exposing (..)
import Locale exposing (Helpers)



-- UPDATE


type Msg
    = NextPage



-- VIEW


view : Helpers -> String -> Html Msg
view helpers platform =
    div
        [ classList
            [ ( "step", True )
            , ( "step-welcome", True )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ Icons.cozyBig
            , h1 [] [ text (helpers.t "Welcome Your own private cloud") ]
            , a
                [ class "btn"
                , href "#"
                , onClick NextPage
                ]
                [ span [] [ text (helpers.t "Welcome Sign in to your Cozy") ] ]
            , a
                [ href ("https://cozy.io/en/try-it/?from=desktop-" ++ platform)
                , class "more-info"
                ]
                [ text (helpers.t "Address Don't have an account? Request one here") ]
            ]
        ]
