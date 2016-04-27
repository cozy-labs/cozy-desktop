module Settings (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
  { version : String
  , autoLaunch : Bool
  }


init : String -> Model
init version' =
  { version = version'
  , autoLaunch = True
  }



-- UPDATE


type Action
  = SetAutoLaunch Bool


update : Action -> Model -> Model
update action model =
  case
    action
  of
    SetAutoLaunch autoLaunch' ->
      { model | autoLaunch = autoLaunch' }



-- VIEW


type alias Context =
  { autoLaunch : Signal.Address Bool
  }


view : Context -> Model -> Html
view context model =
  section
    [ class "two-panes__content two-panes__content--settings" ]
    [ h1 [] [ text "Settings" ]
    , div
        [ attribute "data-input" "checkbox" ]
        [ input
            [ type' "checkbox"
            , checked model.autoLaunch
            , id "auto-launch"
            , on "change" targetChecked (Signal.message context.autoLaunch)
            ]
            []
        , label
            [ for "auto-launch" ]
            [ text "Start Cozy-Desktop on system startup" ]
        ]
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
