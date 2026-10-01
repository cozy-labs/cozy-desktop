module Window.Onboarding.Welcome exposing
    ( Msg(..)
    , view
    )

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import View.Logo as Logo
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
        [ div [ class "wizard__main" ]
            [ Logo.view True
            , p [ class "wizard__tagline" ]
                [ text (helpers.t "Welcome Your own private cloud") ]
            , div [ class "wizard__buttons" ]
                [ a
                    [ class "c-btn"
                    , href "#"
                    , onClick LoginWithTwake
                    ]
                    [ span [] [ text (helpers.t "Welcome Sign in") ] ]
                , a
                    [ class "c-btn c-btn--secondary"
                    , href "#"
                    , onClick LoginWithCustomServer
                    ]
                    [ span [] [ text (helpers.t "Welcome Sign in with company account") ] ]
                ]
            ]
        , div [ class "wizard__footer" ]
            [ a
                [ class "wizard__signup"
                , href "https://sign-up.twake.app?register"
                ]
                [ text (helpers.t "Welcome Create account") ]
            , p [ class "wizard__disclaimer" ]
                [ text (helpers.t "Welcome By continuing, you agree to our")
                , text " "
                , a [ href "https://twake.app/terms" ] [ text (helpers.t "Welcome Terms of use") ]
                , text " "
                , text (helpers.t "Welcome and")
                , text " "
                , a [ href "https://twake.app/policy" ] [ text (helpers.t "Welcome Privacy Policy") ]
                ]
            ]
        ]
