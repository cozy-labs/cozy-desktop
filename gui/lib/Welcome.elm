module Welcome (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


type alias Context =
  { next : Signal.Address () }


view : Context -> Html
view context =
  div
    [ classList
        [ ( "step", True )
        , ( "step-welcome", True )
        ]
    ]
    [ div
        [ class "upper" ]
        [ img [ src "images/happycloud.png" ] [] ]
    , h1 [] [ text "Your own private cloud" ]
    , a
        [ class "btn"
        , href "#"
        , onClick context.next ()
        ]
        [ text "Sign in to your Cozy" ]
    ]
