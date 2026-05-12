module Window.Onboarding.Welcome exposing
    ( Msg(..)
    , view
    )

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons exposing (..)
import Window.Onboarding.Context as Context exposing (Context)



-- UPDATE


type Msg
    = LoginWithTwake
    | LoginWithCustomServer
    | LoginWithAddress



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    div
        [ classList
            [ ( "step", True )
            , ( "step-welcome", True )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ Icons.badge Icons.twakeDrive
            , h1 [] [ text (helpers.t "Welcome Your own private cloud") ]
            , a
                [ class "c-btn c-btn--full"
                , href "#"
                , onClick LoginWithTwake
                ]
                [ span [] [ text (helpers.t "Welcome Sign in") ] ]
            , a
                [ class "c-btn c-btn--secondary c-btn--full"
                , href "https://sign-up.twake.app?register"
                ]
                [ span [] [ text (helpers.t "Welcome Create account") ] ]
            , a
                [ class "more-info"
                , href "#"
                , onClick LoginWithCustomServer
                ]
                [ text (helpers.t "Welcome Use my organization server") ]
            ]
        ]
