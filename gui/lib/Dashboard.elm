module Dashboard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)


-- MODEL


type Status
  = UpToDate
  | Sync String
  | Error String


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
          p
            [ class "status" ]
            [ img
                [ src "images/done.svg"
                , class "status__icon status__icon--uptodate"
                ]
                []
            , text "Your cozy is up to date!"
            ]

        Sync filename ->
          p
            [ class "status" ]
            [ img
                [ src "images/sync.svg"
                , class "status__icon status__icon--sync"
                ]
                []
            , span
                []
                [ text "Syncing "
                , em [] [ text filename ]
                ]
            ]

        Error message ->
          p
            [ class "status" ]
            [ img
                [ src "images/error.svg"
                , class "status__icon status__icon--error"
                ]
                []
            , span
                []
                [ text "Error: "
                , em [] [ text message ]
                ]
            ]
  in
    section
      [ class "two-panes__content" ]
      [ h1 [] [ text "Dashboard" ]
      , statusMessage
      , h2 [] [ text "Recent activities" ]
      ]
