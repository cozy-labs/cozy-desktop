module Folder (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
  { folder : String
  , error : Bool
  }


init : Model
init =
  { folder = ""
  , error = False
  }



-- UPDATE


type Action
  = FillFolder String


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillFolder folder' ->
      { model | folder = folder', error = False }



-- VIEW


type alias Context =
  { chooseFolder : Signal.Address ()
  , next : Signal.Address ()
  }


view : Context -> Model -> Html
view context model =
  div
    [ classList
        [ ( "step", True )
        , ( "step-folder", True )
        , ( "step-error", model.error )
        ]
    ]
    [ p [ class "spacer" ] [ text "" ]
    , img
        [ src "images/done.svg"
        , class "done"
        ]
        []
    , h2 [] [ text "All done" ]
    , p [] [ text "Select a location for your Cozy folder:" ]
    , a
        [ class "folder__selector"
        , href "#"
        , onClick context.chooseFolder ()
        ]
        [ text model.folder
        , img [ src "images/down.svg" ] []
        ]
    , a
        [ class "btn"
        , href "#"
        , onClick context.next ()
        ]
        [ text "Use Cozy Desktop" ]
    ]
