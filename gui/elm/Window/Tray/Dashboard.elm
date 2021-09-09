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
import Data.UserAction as UserAction exposing (UserAction)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Locale exposing (Helpers)
import Ports
import Time



-- MODEL


type alias Model =
    { now : Time.Posix
    , files : List File
    , page : Int
    , platform : Platform
    , userActions : List UserAction
    }


init : Platform -> Model
init platform =
    { now = Time.millisToPosix 0
    , files = []
    , page = 1
    , platform = platform
    , userActions = []
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
    | Reset
    | GotUserActions (List UserAction)
    | SendActionCommand UserAction.Command UserAction
    | UserActionSkipped UserAction
    | UserActionInProgress UserAction
    | UserActionDone UserAction
    | UserActionDetails UserAction


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

        Reset ->
            ( { model | page = 1 }, Cmd.none )

        GotUserActions actions ->
            ( { model | userActions = actions }, Cmd.none )

        SendActionCommand cmd action ->
            ( model, UserAction.sendCommand cmd action )

        UserActionSkipped action ->
            ( model |> removeCurrentAction, Cmd.none )

        UserActionInProgress action ->
            ( model, UserAction.start action )

        UserActionDone action ->
            ( model |> removeCurrentAction, Cmd.none )

        UserActionDetails action ->
            ( model, UserAction.showDetails action )



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
        , span [ class "file-line-content file-extra" ]
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


viewActions : Helpers -> Model -> Html Msg
viewActions helpers model =
    let
        msg =
            \actionMsg ->
                case actionMsg of
                    UserAction.ShowInParent path ->
                        ShowInParent path

                    UserAction.SendCommand cmd action ->
                        SendActionCommand cmd action
    in
    case model.userActions of
        action :: _ ->
            Html.map msg
                (UserAction.view
                    helpers
                    model.platform
                    action
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
        [ viewActions helpers model
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


removeCurrentAction : Model -> Model
removeCurrentAction model =
    { model
        | userActions =
            List.tail model.userActions
                |> Maybe.withDefault []
    }


currentUserAction : Model -> Maybe UserAction
currentUserAction model =
    List.head model.userActions
