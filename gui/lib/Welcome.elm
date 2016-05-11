module Welcome exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- UPDATE


type Msg
    = NextPage



-- VIEW


view : Html Msg
view =
    div
        [ classList
            [ ( "step", True )
            , ( "step-welcome", True )
            ]
        ]
        [ div [ class "upper" ] []
        , div [ class "upper" ]
            [ img [ src "images/happycloud.png" ] [] ]
        , h1 [] [ text "Your own private cloud" ]
        , a
            [ class "btn"
            , href "#"
            , onClick NextPage
            ]
            [ text "Sign in to your Cozy" ]
        ]
