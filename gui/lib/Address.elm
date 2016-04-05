module Address (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import OnEnter exposing (onEnter)


-- MODEL


type alias Model =
  { address : String
  , error : String
  , busy : Bool
  }


init : Model
init =
  { address = ""
  , error = ""
  , busy = False
  }



-- UPDATE


type Action
  = FillAddress String
  | SetError String
  | SetBusy


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillAddress address' ->
      { address = address', error = "", busy = False }

    SetError error' ->
      { model | error = error', busy = False }

    SetBusy ->
      { model | busy = True }



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
        , ( "step-address", True )
        , ( "step-error", model.error /= "" )
        ]
    ]
    [ p
        [ class "upper error-message" ]
        [ text model.error ]
    , div
        [ class "upper" ]
        [ input
            [ placeholder "Cozy address"
            , class "wizard__address"
            , value model.address
            , on "input" targetValue (Signal.message context.actions << FillAddress)
            , onEnter context.next ()
            ]
            []
        ]
    , p
        []
        [ text "This is the web address you use to sign in to your cozy." ]
    , a
        [ href "https://cozy.io/en/try-it/"
        , class "more-info"
        ]
        [ text "Don't have an account? Request one here" ]
    , a
        [ class "btn"
        , href "#"
        , if model.busy then
            attribute "aria-busy" "true"
          else
            onClick context.next ()
        ]
        [ text "Next" ]
    ]
