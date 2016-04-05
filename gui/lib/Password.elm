module Password (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import OnEnter exposing (onEnter)


-- MODEL


type alias Model =
  { password : String
  , address : String
  , error : String
  , busy : Bool
  }


init : Model
init =
  { password = ""
  , address = ""
  , error = ""
  , busy = False
  }



-- UPDATE


type Action
  = FillPassword String
  | FillAddress String
  | SetError String
  | SetBusy


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillPassword password' ->
      { model | password = password', error = "", busy = False }

    FillAddress address' ->
      { model | address = address', busy = False }

    SetError error' ->
      { model | error = error', busy = False }

    SetBusy ->
      { model | busy = True }



-- VIEW


type alias Context =
  { actions : Signal.Address Action
  , next : Signal.Address ()
  , back : Signal.Address ()
  }


view : Context -> Model -> Html
view context model =
  div
    [ classList
        [ ( "step", True )
        , ( "step-password", True )
        , ( "step-error", model.error /= "" )
        ]
    ]
    [ p
        [ class "upper error-message" ]
        [ text model.error ]
    , div
        [ class "upper" ]
        [ input
            [ placeholder "Password"
            , class "wizard__password"
            , type' "password"
            , value model.password
            , on "input" targetValue (Signal.message context.actions << FillPassword)
            , onEnter context.next ()
            ]
            []
        ]
    , p
        []
        [ text "Your password for the cozy address: "
        , em [] [ text model.address ]
        ]
    , a
        [ href "#"
        , class "more-info"
        , onClick context.back ()
        ]
        [ text "Wrong cozy address ?" ]
    , a
        [ class "btn"
        , href "#"
        , if model.busy then
            attribute "aria-busy" "true"
          else
            onClick context.next ()
        ]
        [ text "Login" ]
    ]
