port module Window.Tray.Settings exposing
    ( Model
    , Msg(..)
    , diskQuotaLine
    , gotDiskSpace
    , init
    , update
    , versionLine
    , view
    )

import Data.Bytes as Bytes exposing (Bytes)
import Data.Confirmation as Confirmation exposing (Confirmation, ConfirmationID, askForConfirmation)
import Data.Status exposing (Status(..))
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Ports
import Url exposing (Url)
import Util.Conditional exposing (viewIf)
import View.ProgressBar as ProgressBar


reinitializationConfirmationId : ConfirmationID
reinitializationConfirmationId =
    Confirmation.newId "ReinitializationRequested"



-- MODEL


type alias Model =
    { version : String
    , newRelease : Maybe ( String, String )
    , autoLaunch : Bool
    , syncConfig : SyncConfig
    , disk : DiskSpace
    , busyUnlinking : Bool
    , busyQuitting : Bool
    , manualSyncRequested : Bool
    , reinitializationInProgress : Bool
    }


type alias DiskSpace =
    { used : Bytes
    , quota : Bytes
    }


init : String -> Model
init version =
    { version = version
    , newRelease = Nothing
    , autoLaunch = True
    , syncConfig = SyncConfig.init
    , disk =
        { used = Bytes.fromInt 0
        , quota = Bytes.fromInt 0
        }
    , busyUnlinking = False
    , busyQuitting = False
    , manualSyncRequested = False
    , reinitializationInProgress = False
    }



-- UPDATE


type Msg
    = GotSyncConfig SyncConfig
    | SetAutoLaunch Bool
    | AutoLaunchSet Bool
    | QuitAndInstall
    | NewRelease ( String, String )
    | UpdateDiskSpace DiskSpace
    | UnlinkCozy
    | CancelUnlink
    | ShowHelp
    | CloseApp
    | Sync
    | EndManualSync
    | ReinitializationRequested Confirmation
    | ReinitializationConfirmed ( ConfirmationID, Bool )
    | GotReinitializationStatus String


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        GotSyncConfig syncConfig ->
            ( { model | syncConfig = syncConfig }, Cmd.none )

        SetAutoLaunch autoLaunch ->
            ( { model | autoLaunch = autoLaunch }, Ports.autoLauncher autoLaunch )

        AutoLaunchSet autoLaunch ->
            ( { model | autoLaunch = autoLaunch }, Cmd.none )

        QuitAndInstall ->
            ( model, Ports.quitAndInstall () )

        NewRelease ( notes, name ) ->
            ( { model | newRelease = Just ( notes, name ) }, Cmd.none )

        UpdateDiskSpace disk ->
            ( { model | disk = disk }, Cmd.none )

        UnlinkCozy ->
            ( { model | busyUnlinking = True }, Ports.unlinkCozy () )

        CancelUnlink ->
            ( { model | busyUnlinking = False }, Cmd.none )

        ShowHelp ->
            ( model, Ports.showHelp () )

        CloseApp ->
            ( { model | busyQuitting = True }, Ports.closeApp () )

        Sync ->
            ( { model | manualSyncRequested = True }, Ports.manualStartSync () )

        EndManualSync ->
            ( { model | manualSyncRequested = False }, Cmd.none )

        ReinitializationRequested confirmation ->
            ( model, askForConfirmation confirmation )

        ReinitializationConfirmed ( id, confirmed ) ->
            if id == reinitializationConfirmationId && confirmed == True then
                ( { model | reinitializationInProgress = True }, Ports.reinitializeSynchronization () )

            else
                ( model, Cmd.none )

        GotReinitializationStatus status ->
            case status of
                "failed" ->
                    ( { model | reinitializationInProgress = False }, Cmd.none )

                "complete" ->
                    ( { model | reinitializationInProgress = False }, Cmd.none )

                _ ->
                    ( model, Cmd.none )



-- SUBSCRIPTIONS


port diskSpace : (EncodedDiskSpace -> msg) -> Sub msg


gotDiskSpace : (DiskSpace -> msg) -> Sub msg
gotDiskSpace msg =
    diskSpace (msg << decode)


decode : EncodedDiskSpace -> DiskSpace
decode { used, quota } =
    DiskSpace (Bytes.fromInt used) (Bytes.fromInt quota)


type alias EncodedDiskSpace =
    { used : Int
    , quota : Int
    }



-- VIEW


diskQuotaLine : Helpers -> Model -> Html Msg
diskQuotaLine helpers model =
    if Bytes.isZero model.disk.quota then
        div []
            [ text (helpers.human_readable_bytes model.disk.used ++ " / ∞") ]

    else
        div []
            [ text
                (helpers.human_readable_bytes model.disk.used
                    ++ " / "
                    ++ helpers.human_readable_bytes model.disk.quota
                )
            , ProgressBar.view (Bytes.toFloat model.disk.used / Bytes.toFloat model.disk.quota)
            ]


versionLine : Helpers -> Model -> Html Msg
versionLine helpers model =
    case model.newRelease of
        Just ( name, changes ) ->
            span [ class "version-need-update" ]
                [ text model.version
                , a [ onClick QuitAndInstall, href "#", class "c-btn c-btn--secondary u-mt-1" ]
                    [ span [] [ text (helpers.t "Settings Install the new release and restart the application") ] ]
                ]

        Nothing ->
            span [ class "version-uptodate" ] [ text model.version ]


view : Helpers -> Status -> Model -> Html Msg
view helpers status model =
    let
        { partialSyncEnabled } =
            model.syncConfig.flags
    in
    section [ class "two-panes__content two-panes__content--settings" ]
        [ h2 [] [ text (helpers.t "Account Cozy disk space") ]
        , diskQuotaLine helpers model
        , h2 [] [ text (helpers.t "Settings Start Cozy Drive on system startup") ]
        , div
            [ class "coz-form-toggle"
            ]
            [ span [ class "toggle" ]
                [ input
                    [ type_ "checkbox"
                    , checked model.autoLaunch
                    , id "auto-launch"
                    , class "checkbox"
                    , onCheck SetAutoLaunch
                    ]
                    []
                , label [ class "label", for "auto-launch" ] []
                ]
            , text (helpers.t "Settings Startup")
            ]
        , viewIf partialSyncEnabled <|
            h2 [] [ text (helpers.t "Settings Selective synchronization") ]
        , viewIf partialSyncEnabled <|
            selectiveSyncButton helpers model
        , h2 [] [ text (helpers.t "Account About") ]
        , p []
            [ strong [] [ text (helpers.t "Account Account" ++ " ") ]
            , cozyLink model
            ]
        , p []
            [ strong [] [ text (helpers.t "Account Device name" ++ " ") ]
            , text model.syncConfig.deviceName
            ]
        , p []
            [ strong [] [ text (helpers.t "Settings Version" ++ " ") ]
            , versionLine helpers model
            ]
        , h2 [] [ text (helpers.t "Help Help") ]
        , showHelpButton helpers model
        , h2 [] [ text (helpers.t "Tray Quit application") ]
        , quitButton helpers model
        , h2 [] [ text (helpers.t "Settings Reinitialize synchronization") ]
        , p []
            [ text (helpers.t "Settings The synchronization of the local Cozy folder with your personal Cozy Cloud will be entirely rebuilt." ++ " ")
            , text (helpers.t "Settings Your files won't be deleted.")
            ]
        , reinitializationButton helpers model
        , h2 [] [ text (helpers.t "Account Unlink Cozy") ]
        , p []
            [ text (helpers.t "Account It will unlink your account to this computer." ++ " ")
            , text (helpers.t "Account Your files won't be deleted.")
            ]
        , unlinkButton helpers model
        ]


syncButton : Helpers -> Status -> Model -> Html Msg
syncButton helpers status model =
    let
        enabled =
            status == UpToDate && not model.manualSyncRequested
    in
    a
        [ class "c-btn c-btn--secondary"
        , href "#"
        , if enabled then
            onClick Sync

          else
            attribute "disabled" "true"
        ]
        [ span [] [ text (helpers.t "Settings Sync") ] ]


selectiveSyncButton : Helpers -> Model -> Html Msg
selectiveSyncButton helpers model =
    let
        { deviceId } =
            model.syncConfig

        settingsUrl =
            SyncConfig.buildAppUrl model.syncConfig "settings"

        configurationUrl =
            case settingsUrl of
                Just url ->
                    String.join "/" [ Url.toString url, "#/connectedDevices", deviceId ]

                Nothing ->
                    ""
    in
    a
        [ class "c-btn"
        , href configurationUrl
        ]
        [ span [] [ text (helpers.t "Settings Configure") ] ]


cozyLink : Model -> Html Msg
cozyLink model =
    let
        { address } =
            model.syncConfig

        url =
            Maybe.withDefault "" <| Maybe.map Url.toString address
    in
    a [ href url ] [ text url ]


showHelpButton : Helpers -> Model -> Html Msg
showHelpButton helpers model =
    a
        [ class "c-btn c-btn--secondary"
        , href "#"
        , onClick ShowHelp
        ]
        [ span [] [ text (helpers.t "Help Send us a message") ] ]


quitButton : Helpers -> Model -> Html Msg
quitButton helpers model =
    a
        [ class "c-btn c-btn--danger-outline"
        , href "#"
        , if model.busyQuitting then
            attribute "aria-busy" "true"

          else
            onClick CloseApp
        ]
        [ span [] [ text (helpers.t "AppMenu Quit") ] ]


reinitializationButton : Helpers -> Model -> Html Msg
reinitializationButton helpers model =
    let
        confirmation =
            { id = reinitializationConfirmationId
            , title = helpers.t "Reinitialization"
            , message = helpers.t "Reinitialization Are you sure you want to reinitialize the synchronization?"
            , detail =
                helpers.t "Reinitialization Beware,"
                    ++ "\n"
                    ++ helpers.t
                        "Reinitialization - if some document deletions were not synchronized, these documents will re-appear if you don't delete them beforehand on the other side;"
                    ++ "\n"
                    ++ helpers.t
                        "Reinitialization - if some files exist on both sides but have different content then conflicts will be created so you can choose the version you wish to keep;"
                    ++ "\n"
                    ++ helpers.t
                        "Reinitialization - if some files are only present on your Cozy or your computer, they will be added to the other side;"
                    ++ "\n"
                    ++ helpers.t
                        "Reinitialization - files already identical on both sides won't be impacted."
            , mainAction = helpers.t "Reinitialization Reinitialize"
            }
    in
    a
        [ class "c-btn c-btn--danger-outline"
        , href "#"
        , if model.reinitializationInProgress then
            attribute "aria-busy" "true"

          else
            onClick (ReinitializationRequested confirmation)
        ]
        [ span [] [ text (helpers.t "Settings Reinitialize") ] ]


unlinkButton : Helpers -> Model -> Html Msg
unlinkButton helpers model =
    a
        [ class "c-btn c-btn--danger-outline"
        , href "#"
        , if model.busyUnlinking then
            attribute "aria-busy" "true"

          else
            onClick UnlinkCozy
        ]
        [ span [] [ text (helpers.t "Account Unlink this Cozy") ] ]
