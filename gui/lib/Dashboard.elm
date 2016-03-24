module Dashboard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


view : Html
view =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Dashboard" ]
    , p [] [ text "Your Cozy is synchronizing" ]
    , h2 [] [ text "Recent activities" ]
    ]
