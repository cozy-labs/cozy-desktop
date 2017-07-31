module Welcome exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- UPDATE


type Msg
    = NextPage



-- VIEW


view : Helpers -> Html Msg
view helpers =
    div
        [ classList
            [ ( "step", True )
            , ( "step-welcome", True )
            ]
        ]
        [ div [ class "upper" ] []
        , div [ class "upper" ]
            [ img [ src "images/happycloud.png" ] [] ]
        , h1 [] [ text (helpers.t "Welcome Your own private cloud") ]
        , a
            [ class "btn"
            , href "#"
            , onClick NextPage
            ]
            [ text (helpers.t "Welcome Sign in to your Cozy") ]
        ]
