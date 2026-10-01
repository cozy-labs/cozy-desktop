module Window.Onboarding.Folder exposing
    ( Msg(..)
    , isValid
    , update
    , view
    )

import Data.SyncConfig as SyncConfig
import Data.SyncFolderConfig as SyncFolderConfig exposing (SyncFolderConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons exposing (..)
import Ports
import Url
import Util.Conditional exposing (viewIf)
import Window.Onboarding.Context as Context exposing (Context)



-- MODEL


isValid : SyncFolderConfig -> Bool
isValid =
    SyncFolderConfig.isValid



-- UPDATE


type Msg
    = ChooseFolder
    | FillFolder SyncFolderConfig
    | SetError String
    | StartSync


update : Msg -> Context -> ( Context, Cmd msg )
update msg context =
    case msg of
        FillFolder folderConfig ->
            ( Context.setFolderConfig context folderConfig, Cmd.none )

        ChooseFolder ->
            ( context, Ports.chooseFolder () )

        SetError error ->
            ( Context.setFolderConfig context
                (SyncFolderConfig.setError context.folderConfig error)
            , Cmd.none
            )

        StartSync ->
            ( context, Ports.startSync context.folderConfig.folder )



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    let
        { partialSyncEnabled } =
            context.syncConfig.flags
    in
    div
        [ class "step step-folder" ]
        [ div
            [ class "step-content" ]
            [ Icons.bigTick
            , h1 [ class "wizard__title" ]
                [ text <|
                    helpers.t "Folder You're all set!"
                ]
            , p [ class "wizard__helper" ]
                [ text <|
                    helpers.t "Folder You can now synchronize your Twake Workplace with this computer."
                ]
            , div [ class "wizard__details" ]
                [ ul []
                    [ viewIf partialSyncEnabled <|
                        li []
                            [ span [ class "folder__config-option__title" ]
                                [ text <| helpers.t "Folder Selective synchronization" ]
                            , text " - "
                            , text <| helpers.t "Folder By default all the documents on your Twake Workplace will be synchronized."
                            , selectiveSyncLink helpers context
                            ]
                    , li []
                        [ span [ class "folder__config-option__title" ]
                            [ text <| helpers.t "Folder Location on the computer" ]
                        , text " - "
                        , text <| helpers.t "Folder The documents selected on your Twake Workplace will be synchronized on this computer in "
                        , span [ class "folder__path" ] [ text context.folderConfig.folder ]
                        , text "."
                        , a [ class "wizard__inline-link", href "#", onClick ChooseFolder ]
                            [ text <|
                                helpers.t "Folder Modify"
                            ]
                        ]
                    ]
                , if isValid context.folderConfig then
                    text ""

                  else
                    p [ class "u-error" ]
                        [ text <|
                            helpers.interpolate [ context.folderConfig.folder ]
                                "Folder You cannot synchronize your data directly in "
                        , span [ class "folder__path" ]
                            [ text context.folderConfig.folder
                            ]
                        , br [] []
                        , text <|
                            helpers.t "Folder Please choose another location"
                        ]
                ]
            , a
                [ class "c-btn c-btn--full"
                , href "#"
                , if isValid context.folderConfig then
                    onClick StartSync

                  else
                    attribute "disabled" "true"
                ]
                [ span [] [ text (helpers.t "Folder Start synchronization") ] ]
            ]
        ]


selectiveSyncLink : Helpers -> Context -> Html Msg
selectiveSyncLink helpers context =
    let
        { deviceId } =
            context.syncConfig

        settingsUrl =
            SyncConfig.buildAppUrl context.syncConfig "settings"

        configurationUrl =
            case settingsUrl of
                Just url ->
                    String.join "/" [ Url.toString url, "#/connectedDevices", deviceId ]

                Nothing ->
                    ""
    in
    a [ class "wizard__inline-link", href configurationUrl ]
        [ text <|
            helpers.t "Folder Modify"
        ]
