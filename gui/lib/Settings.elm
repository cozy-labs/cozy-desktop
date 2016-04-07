module Settings (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
  { version : String
  }


init : String -> Model
init version' =
  { version = version'
  }



-- VIEW


view : Model -> Html
view model =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Settings" ]
    , h2 [] [ text "Version" ]
    , p
        []
        [ text ("Cozy-Desktop " ++ model.version)
        , br [] []
        , a
            [ href "https://github.com/cozy-labs/cozy-desktop" ]
            [ text "Github Page" ]
        ]
    ]
