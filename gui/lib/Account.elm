module Account (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- VIEW


type alias Context =
  { unlinkCozy : Signal.Address () }


view : Context -> String -> Html
view context address =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Account" ]
    , h3
        []
        [ a [ href address ] [ text address ] ]
    , h2 [] [ text "Unlink Cozy" ]
    , p
        []
        [ text "It will unlink your account to this computer. "
        , text "Your files won't be deleted. "
        , text "Are you sure to unlink this account?"
        ]
    , a
        [ class "btn btn--danger"
        , href "#"
        , onClick context.unlinkCozy ()
        ]
        [ text "Unlink this Cozy" ]
    ]
