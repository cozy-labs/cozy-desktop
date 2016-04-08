module Account (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type alias Model =
  { address : String
  }


init : Model
init =
  { address = ""
  }



-- UPDATE


type Action
  = FillAddress String


update : Action -> Model -> Model
update action model =
  case
    action
  of
    FillAddress address' ->
      { model | address = address' }



-- VIEW


type alias Context =
  { unlinkCozy : Signal.Address () }


view : Context -> Model -> Html
view context model =
  section
    [ class "two-panes__content" ]
    [ h1 [] [ text "Account" ]
    , h3
        []
        [ a [ href model.address ] [ text model.address ] ]
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
