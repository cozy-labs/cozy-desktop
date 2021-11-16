module Window.Tray.Settings exposing
    ( Model
    , Msg(..)
    , diskQuotaLine
    , humanReadableDiskValue
    , init
    , update
    , versionLine
    , view
    )

import Data.DiskSpace exposing (DiskSpace)
import Data.Status exposing (Status(..))
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Locale exposing (Helpers)
import Ports
import Url exposing (Url)
import Util.Conditional exposing (viewIf)
import View.ProgressBar as ProgressBar



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
    }


init : String -> Model
init version =
    { version = version
    , newRelease = Nothing
    , autoLaunch = True
    , syncConfig = SyncConfig.init
    , disk =
        { used = 0
        , quota = 0
        }
    , busyUnlinking = False
    , busyQuitting = False
    , manualSyncRequested = False
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



-- VIEW


humanReadableDiskValue : Helpers -> Float -> String
humanReadableDiskValue helpers v =
    String.fromInt (round (v / 1000000)) ++ " M" ++ helpers.t "Account b"


diskQuotaLine : Helpers -> Model -> Html Msg
diskQuotaLine helpers model =
    if model.disk.quota == 0 then
        div []
            [ text (humanReadableDiskValue helpers model.disk.used ++ " / ∞") ]

    else
        div []
            [ text
                (humanReadableDiskValue helpers model.disk.used
                    ++ " / "
                    ++ humanReadableDiskValue helpers model.disk.quota
                )
            , ProgressBar.view (model.disk.used / model.disk.quota)
            ]


versionLine : Helpers -> Model -> Html Msg
versionLine helpers model =
    case model.newRelease of
        Just ( name, changes ) ->
            span [ class "version-need-update" ]
                [ text model.version
                , a [ onClick QuitAndInstall, href "#", class "btn btn--action" ]
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
        , h2 [] [ text (helpers.t "Settings Synchronize manually") ]
        , syncButton helpers status model
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
        , a
            [ class "btn"
            , href "#"
            , onClick ShowHelp
            ]
            [ span [] [ text (helpers.t "Help Send us a message") ] ]
        , h2 [] [ text (helpers.t "Tray Quit application") ]
        , a
            [ class "btn btn--danger"
            , href "#"
            , if model.busyQuitting then
                attribute "aria-busy" "true"

              else
                onClick CloseApp
            ]
            [ span [] [ text (helpers.t "AppMenu Quit") ] ]
        , h2 [] [ text (helpers.t "Account Unlink Cozy") ]
        , p []
            [ text (helpers.t "Account It will unlink your account to this computer." ++ " ")
            , text (helpers.t "Account Your files won't be deleted." ++ " ")
            , text (helpers.t "Account Are you sure to unlink this account?" ++ " ")
            ]
        , a
            [ class "btn btn--danger"
            , href "#"
            , if model.busyUnlinking then
                attribute "aria-busy" "true"

              else
                onClick UnlinkCozy
            ]
            [ span [] [ text (helpers.t "Account Unlink this Cozy") ] ]
        ]


cozyLink : Model -> Html Msg
cozyLink model =
    let
        { address } =
            model.syncConfig

        url =
            Maybe.withDefault "" <| Maybe.map Url.toString address
    in
    a [ href url ] [ text url ]


syncButton : Helpers -> Status -> Model -> Html Msg
syncButton helpers status model =
    let
        enabled =
            status == UpToDate && not model.manualSyncRequested
    in
    a
        [ class "btn"
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
        [ class "btn"
        , href configurationUrl
        ]
        [ span [] [ text (helpers.t "Settings Configure") ] ]
