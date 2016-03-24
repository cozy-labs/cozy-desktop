module Account (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


view : Html
view =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Account" ]
    , h3 [] [ text "https://luc.cozycloud.cc" ]
    , h2 [] [ text "Unlink Cozy" ]
    , p
        []
        [ text "It will unlink your account to this computer."
        , text "Your files won't be deleted."
        , text "Are you sure to unlink this account?"
        ]
    , a
        [ class "btn btn--danger"
        , href "#"
        ]
        [ text "Unlink this Cozy" ]
    ]
