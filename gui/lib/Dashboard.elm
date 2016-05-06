module Dashboard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)
import Helpers exposing (..)


-- MODEL


type Status
  = UpToDate
  | Sync String
  | Error String


type alias File =
  { filename : String
  , icon : String
  , path : String
  , size : Int
  , updated : Time
  }


type alias Model =
  { status : Status
  , now : Time
  , files : List File
  }


init : Model
init =
  { status = Sync "…"
  , now = 0
  , files = []
  }



-- UPDATE


type Action
  = Updated
  | Transfer File
  | Remove File
  | SetError String
  | Tick Time


samePath : File -> File -> Bool
samePath a b =
  a.path == b.path


update : Action -> Model -> Model
update action model =
  case action of
    Updated ->
      { model | status = UpToDate }

    Transfer file ->
      let
        files' =
          file
            :: (List.filter (samePath file >> not) model.files)
            |> List.take 20

        status' =
          Sync file.filename
      in
        { model | status = status', files = files' }

    Remove file ->
      let
        files' =
          List.filter (samePath file >> not) model.files
      in
        { model | files = files' }

    SetError error ->
      { model | status = Error error }

    Tick now' ->
      { model | now = now' }



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

    fileToListItem file =
      let
        file_size =
          number_to_human_size file.size

        time_ago =
          distance_of_time_in_words file.updated model.now
      in
        li
          [ title file.path ]
          [ i [ class ("file-type file-type-" ++ file.icon) ] []
          , h3 [ class "file-name" ] [ text file.filename ]
          , span [ class "file-size" ] [ text file_size ]
          , span [ class "file-time-ago" ] [ text time_ago ]
          ]

    recentList =
      List.map fileToListItem model.files
  in
    section
      [ class "two-panes__content two-panes__content--dashboard" ]
      [ h1 [] [ text "Dashboard" ]
      , statusMessage
      , h2 [] [ text "Recent activities" ]
      , ul [ class "recent-files" ] recentList
      ]
