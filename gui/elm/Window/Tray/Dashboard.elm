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
import Json.Decode as Json
import Ports
import Time
import Util.Conditional exposing (viewIf)
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
    | OpenPath Path
    | ShowInParent Path
    | Tick Time.Posix
    | ShowMore
    | ShowHelp
    | Reset
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

        OpenPath path ->
            ( model, Ports.openFile (Path.toString path) )

        ShowInParent path ->
            ( model, Ports.showInParent (Path.toString path) )

        Tick now ->
            ( { model | now = now }, Cmd.none )

        ShowMore ->
            ( { model | page = model.page + 1 }, Cmd.none )

        ShowHelp ->
            ( model, Ports.showHelp () )

        Reset ->
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
        , onClick (OpenPath file.path)
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
                    , stopPropagationOn "click" <|
                        Json.map (\msg -> ( msg, True )) <|
                            Json.succeed (ShowInParent file.path)
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
                    UserAlert.ShowInParent path ->
                        ShowInParent path

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
    in
    section [ class "two-panes__content two-panes__content--dashboard" ]
        [ viewAlerts helpers model
        , div [ class "recent-files" ]
            (List.map renderLine filesToRender
                ++ (if List.length model.files > nbFiles then
                        [ showMoreButton helpers ]

                    else
                        []
                   )
            )
        ]



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
