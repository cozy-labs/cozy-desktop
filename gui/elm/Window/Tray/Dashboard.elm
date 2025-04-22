module Window.Tray.Dashboard exposing
    ( Model
    , Msg(..)
    , init
    , maxActivities
    , nbActivitiesPerPage
    , renderFile
    , showMoreButton
    , update
    , view
    )

import Data.File as File exposing (EncodedFile, File)
import Data.Path as Path exposing (Path)
import Data.Platform as Platform exposing (Platform)
import Data.Progress as Progress
import Data.UserAlert as UserAlert exposing (UserAlert)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Json.Decode as Json
import Ports
import Time
import Util.Conditional exposing (ShowInWeb, inWeb, onOS, viewIf)
import Util.Mouse as Mouse
import View.ProgressBar as ProgressBar



-- MODEL


type alias Model =
    { now : Time.Posix
    , files : List File
    , page : Int
    , platform : Platform
    , userAlerts : List UserAlert
    }


init : Platform -> Model
init platform =
    { now = Time.millisToPosix 0
    , files = []
    , page = 1
    , platform = platform
    , userAlerts = []
    }


nbActivitiesPerPage =
    20


maxActivities =
    250



-- UPDATE


type Msg
    = Transfer EncodedFile
    | Remove EncodedFile
    | OpenPath Path ShowInWeb
    | ShowInParent Path ShowInWeb
    | Tick Time.Posix
    | ShowMore
    | ShowHelp
    | Reset
    | ShowFirstPage
    | GotUserAlerts (List UserAlert)
    | SendActionCommand UserAlert.Command UserAlert
    | UserAlertSkipped UserAlert
    | UserAlertInProgress UserAlert
    | UserAlertDone UserAlert
    | UserAlertDetails UserAlert


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Transfer encodedFile ->
            let
                file =
                    File.decode model.platform encodedFile

                files =
                    file
                        :: List.filter (File.samePath file >> not) model.files
                        |> List.take maxActivities
            in
            ( { model | files = files }, Cmd.none )

        Remove encodedFile ->
            let
                file =
                    File.decode model.platform encodedFile

                files =
                    List.filter (File.samePath file >> not) model.files
            in
            ( { model | files = files }, Cmd.none )

        OpenPath path showInWeb ->
            ( model, Ports.openFile ( Path.toString path, showInWeb ) )

        ShowInParent path showInWeb ->
            ( model, Ports.showInParent ( Path.toString path, showInWeb ) )

        Tick now ->
            ( { model | now = now }, Cmd.none )

        ShowMore ->
            ( { model | page = model.page + 1 }, Cmd.none )

        ShowHelp ->
            ( model, Ports.showHelp () )

        ShowFirstPage ->
            ( { model | page = 1 }, Cmd.none )

        GotUserAlerts alerts ->
            ( { model | userAlerts = alerts }, Cmd.none )

        SendActionCommand cmd alert ->
            ( model, UserAlert.sendCommand cmd alert )

        UserAlertSkipped alert ->
            ( model |> removeCurrentAlert, Cmd.none )

        UserAlertInProgress alert ->
            ( model, UserAlert.start alert )

        UserAlertDone alert ->
            ( model |> removeCurrentAlert, Cmd.none )

        UserAlertDetails alert ->
            ( model, UserAlert.showDetails alert )

        Reset ->
            ( { model | page = 1, files = [], userAlerts = [] }, Cmd.none )



-- VIEW


renderFile : Helpers -> Model -> File -> Html Msg
renderFile helpers model file =
    let
        ( basename, extname ) =
            File.splitName file.filename

        timeAgo =
            helpers.distance_of_time_in_words file.updated model.now

        dirPath =
            Path.parent file.path

        filenameTitle =
            helpers.interpolate [ file.filename ] "Dashboard Open file {0}"

        dirPathTitle =
            if Path.isRoot dirPath then
                helpers.t "Dashboard Show in parent folder"

            else
                helpers.interpolate [ Path.toString dirPath ] "Dashboard Show in folder {0}"

        inProgress =
            not (Progress.done file.progress)

        progressRatio =
            Progress.ratio file.progress

        progress =
            file.progress
    in
    div
        [ class "file-line"
        , title filenameTitle
        , Mouse.onSpecialClick (handleOpenPath file.path)
        ]
        [ div [ class ("file-type file-type-" ++ file.icon) ] []
        , span [ class "file-line-content file-name-wrapper" ]
            [ span [ class "file-name-name" ] [ text basename ]
            , span [ class "file-name-ext" ] [ text extname ]
            ]
        , viewIf (not inProgress) <|
            span [ class "file-line-content file-extra" ]
                [ span [ class "file-time-ago" ] [ text timeAgo ]
                , span
                    [ class "file-parent-folder"
                    , title dirPathTitle
                    , Mouse.onCapturingClick (handleShowInParent file.path)
                    ]
                    [ text (Path.toString dirPath) ]
                ]
        , viewIf inProgress <|
            div [ class "file-progress" ]
                [ ProgressBar.view progressRatio
                , span [ class "file-size" ]
                    [ text (helpers.human_readable_progress progress)
                    ]
                ]
        ]


handleOpenPath : Path -> Mouse.EventWithKeys -> Msg
handleOpenPath path mouseEvent =
    if mouseEvent.keys.ctrl || mouseEvent.keys.meta then
        OpenPath path inWeb

    else
        OpenPath path onOS


handleShowInParent : Path -> Mouse.EventWithKeys -> Msg
handleShowInParent path mouseEvent =
    if mouseEvent.keys.ctrl || mouseEvent.keys.meta then
        ShowInParent path inWeb

    else
        ShowInParent path onOS


showMoreButton : Helpers -> Html Msg
showMoreButton helpers =
    div [ class "show-more-container" ]
        [ a
            [ class "show-more-btn"
            , href "#"
            , onClick ShowMore
            ]
            [ text (helpers.t "Dashboard Show more files") ]
        ]


viewAlerts : Helpers -> Model -> Html Msg
viewAlerts helpers model =
    let
        msg =
            \alertMsg ->
                case alertMsg of
                    UserAlert.ShowInParent path showInWeb ->
                        ShowInParent path showInWeb

                    UserAlert.SendCommand cmd alert ->
                        SendActionCommand cmd alert

                    UserAlert.ShowHelp ->
                        ShowHelp
    in
    case model.userAlerts of
        alert :: _ ->
            Html.map msg
                (UserAlert.view
                    helpers
                    model.platform
                    alert
                )

        _ ->
            Html.text ""


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        nbFiles =
            model.page * nbActivitiesPerPage

        renderLine =
            renderFile helpers model

        filesToRender =
            List.take nbFiles model.files

        hasMoreFiles =
            List.length model.files > nbFiles
    in
    section [ class "two-panes__content two-panes__content--dashboard" ]
        [ viewAlerts helpers model
        , case filesToRender of
            [] ->
                viewEmptyFileList helpers

            _ ->
                viewRecentFileList helpers filesToRender renderLine hasMoreFiles
        ]


viewEmptyFileList : Helpers -> Html Msg
viewEmptyFileList helpers =
    div [ class "recent-files recent-files--empty" ]
        [ Icons.folderEmpty
        , h1 [] [ text (helpers.t "Dashboard This list is empty") ]
        , p [] [ text (helpers.t "Dashboard Files recently synchronized will show up here") ]
        ]


viewRecentFileList : Helpers -> List File -> (File -> Html Msg) -> Bool -> Html Msg
viewRecentFileList helpers files renderLine hasMoreFiles =
    div [ class "recent-files" ]
        (List.map renderLine files
            ++ [ viewIf hasMoreFiles (showMoreButton helpers) ]
        )



--HELPERS


removeCurrentAlert : Model -> Model
removeCurrentAlert model =
    { model
        | userAlerts =
            List.tail model.userAlerts
                |> Maybe.withDefault []
    }


currentUserAlert : Model -> Maybe UserAlert
currentUserAlert model =
    List.head model.userAlerts
