module Settings (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


view : Html
view =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Settings" ]
    , h2 [] [ text "Version" ]
    , p
        []
        [ text "Cozy-Desktop v0.932.123"
        , br [] []
        , a
            [ href "https://github.com/cozy-labs/cozy-desktop" ]
            [ text "Github Page" ]
        ]
    ]
