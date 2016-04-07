module Dashboard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)


-- MODEL


type Status
  = UpToDate
  | Sync String
  | Error String


type alias File =
  { filename : String
  , icon : String
  , size : Int
  }


type alias Model =
  { status : Status
  , files : List File
  }


init : Model
init =
  { status = Sync "…"
  , files = []
  }



-- UPDATE


type Action
  = Updated
  | Transfer File



-- TODO when a file is deleted, remove it from the files list


update : Action -> Model -> Model
update action model =
  case action of
    Updated ->
      { model | status = UpToDate }

    Transfer file ->
      let
        files' =
          List.take 5 (file :: model.files)

        status' =
          Sync file.filename
      in
        { model | status = status', files = files' }



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

    displaySize size =
      if size < 10 ^ 3 then
        (toString size) ++ " B"
      else if size < 10 ^ 6 then
        (toString (toFloat (size // 10 ^ 2) / 10)) ++ " KB"
      else if size < 10 ^ 9 then
        (toString (toFloat (size // 10 ^ 5) / 10)) ++ " MB"
      else
        (toString (toFloat (size // 10 ^ 9) / 10)) ++ " GB"

    fileToListItem file =
      li
        []
        [ i [ class ("file-type file-type-" ++ file.icon) ] []
        , h3 [ class "file-name" ] [ text file.filename ]
        , span [ class "file-size" ] [ text (displaySize file.size) ]
        , span [ class "file-time-ago" ] [ text "Just now" ]
        ]

    recentList =
      List.map fileToListItem model.files
  in
    section
      [ class "two-panes__content" ]
      [ h1 [] [ text "Dashboard" ]
      , statusMessage
      , h2 [] [ text "Recent activities" ]
      , ul [ class "recent-files" ] recentList
      ]
