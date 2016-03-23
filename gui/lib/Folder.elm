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
  { folder = "/home/users/Documents/Cozy"
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
  { actions : Signal.Address Action
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
    [ h2 [] [ text "All done" ]
    , p [] [ text "Select a location for your Cozy folder:" ]
    , input
        [ value model.folder
        , on "input" targetValue (Signal.message context.actions << FillFolder)
        ]
        []
    , a
        [ class "btn"
        , href "#"
        , onClick context.next ()
        ]
        [ text "Use Cozy Desktop" ]
    ]
