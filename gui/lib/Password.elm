module Password (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import OnEnter exposing (onEnter)


-- MODEL


type alias Model =
  { password : String
  , address : String
  , error : Bool
  }


init : Model
init =
  { password = ""
  , address = ""
  , error = False
  }



-- UPDATE


type Action
  = FillPassword String


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillPassword password' ->
      { model | password = password', error = False }



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
        , ( "step-error", model.error )
        ]
    ]
    [ div
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
        , onClick context.next ()
        ]
        [ text "Login" ]
    ]
