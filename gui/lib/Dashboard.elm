module Dashboard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type Status
  = UpToDate
  | Sync String


type alias Model =
  { status : Status
  }


init : Model
init =
  { status = UpToDate
  }



-- VIEW


view : Model -> Html
view model =
  let
    statusMessage =
      case
        model.status
      of
        UpToDate ->
          [ text "Your cozy is up to date!" ]

        Sync filename ->
          [ text "Syncing "
          , em [] [ text filename ]
          ]
  in
    section
      [ class "two-panes__content" ]
      [ h1 [] [ text "Dashboard" ]
      , p [] statusMessage
      , h2 [] [ text "Recent activities" ]
      ]
