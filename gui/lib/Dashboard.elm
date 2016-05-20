module Dashboard exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)
import Helpers exposing (..)


-- MODEL


type Status
    = UpToDate
    | Offline
    | Sync String
    | Error String


type alias File =
    { filename : String
    , icon : String
    , path : String
    , size : Int
    , updated : Time
    }


type alias DiskSpace =
    { used : Float
    , usedUnit : String
    , total : Float
    , totalUnit : String
    }


type alias Model =
    { status : Status
    , now : Time
    , disk : DiskSpace
    , files : List File
    }


init : Model
init =
    { status = Sync "…"
    , now = 0
    , disk =
        { used = 0
        , usedUnit = ""
        , total = 0
        , totalUnit = ""
        }
    , files = []
    }



-- UPDATE


type Msg
    = Updated
    | GoOffline
    | Transfer File
    | Remove File
    | UpdateDiskSpace DiskSpace
    | SetError String
    | Tick Time


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


update : Msg -> Model -> Model
update msg model =
    case msg of
        Updated ->
            { model | status = UpToDate }

        GoOffline ->
            { model | status = Offline }

        Transfer file ->
            let
                files' =
                    file
                        :: (List.filter (samePath file >> not) model.files)
                        |> List.take 250

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

        UpdateDiskSpace disk' ->
            { model | disk = disk' }

        SetError error ->
            { model | status = Error error }

        Tick now' ->
            { model | now = now' }



-- VIEW


view : Model -> Html Msg
view model =
    let
        statusMessage =
            case
                model.status
            of
                UpToDate ->
                    p [ class "status" ]
                        [ img
                            [ src "images/done.svg"
                            , class "status__icon status__icon--uptodate"
                            ]
                            []
                        , text "Your cozy is up to date!"
                        ]

                Offline ->
                    p [ class "status" ]
                        [ img
                            [ src "images/pause.svg"
                            , class "status__icon status__icon--offline"
                            ]
                            []
                        , text "Offline"
                        ]

                Sync filename ->
                    p [ class "status" ]
                        [ img
                            [ src "images/sync.svg"
                            , class "status__icon status__icon--sync"
                            ]
                            []
                        , span []
                            [ text "Syncing "
                            , em [] [ text filename ]
                            ]
                        ]

                Error message ->
                    p [ class "status" ]
                        [ img
                            [ src "images/error.svg"
                            , class "status__icon status__icon--error"
                            ]
                            []
                        , span []
                            [ text "Error: "
                            , em [] [ text message ]
                            ]
                        ]

        diskSpace =
            p [ class "disk-space" ]
                [ img
                    [ src "images/hard-drive.svg"
                    , class "disk-space__icon"
                    ]
                    []
                , text (toString (model.disk.used) ++ " " ++ model.disk.usedUnit ++ "b")
                , text " / "
                , text (toString (model.disk.total) ++ " " ++ model.disk.totalUnit ++ "b")
                ]

        fileToListItem file =
            let
                file_size =
                    number_to_human_size file.size

                time_ago =
                    distance_of_time_in_words file.updated model.now
            in
                li [ title file.path ]
                    [ i [ class ("file-type file-type-" ++ file.icon) ] []
                    , h3 [ class "file-name" ] [ text file.filename ]
                    , span [ class "file-size" ] [ text file_size ]
                    , span [ class "file-time-ago" ] [ text time_ago ]
                    ]

        recentList =
            List.map fileToListItem model.files
    in
        section [ class "two-panes__content two-panes__content--dashboard" ]
            [ h1 [] [ text "Dashboard" ]
            , statusMessage
            , h2 [] [ text "Cozy disk space" ]
            , diskSpace
            , h2 [] [ text "Recent activities" ]
            , ul [ class "recent-files" ] recentList
            ]
