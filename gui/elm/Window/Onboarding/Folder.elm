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
            , h1 []
                [ text <|
                    helpers.t "Folder You're all set!"
                ]
            , p [ class "u-mb-0" ]
                [ text <|
                    helpers.t "Folder You can now synchronize your Cozy with this computer."
                ]
            , div [ class "u-mt-1" ]
                [ ul [ class "u-mb-0 u-pl-1" ]
                    [ viewIf partialSyncEnabled <|
                        li []
                            [ span [ class "folder__config-option__title" ]
                                [ text <| helpers.t "Folder Selective synchronization" ]
                            , text " - "
                            , text <| helpers.t "Folder By default all the documents on your Cozy will be synchronized."
                            , selectiveSyncLink helpers context
                            ]
                    , li [ class "u-mt-1" ]
                        [ span [ class "folder__config-option__title" ]
                            [ text <| helpers.t "Folder Location on the computer" ]
                        , text " - "
                        , text <| helpers.t "Folder The documents selected on your Cozy will be synchronized on this computer in "
                        , span [ class "folder__path" ] [ text context.folderConfig.folder ]
                        , text "."
                        , a [ class "u-ml-half u-primaryColor", href "#", onClick ChooseFolder ]
                            [ text <|
                                helpers.t "Folder Modify"
                            ]
                        ]
                    ]
                , if isValid context.folderConfig then
                    text ""

                  else
                    p [ class "u-error u-mb-0 u-lh-tiny" ]
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

                -- TODO: Link to the relevant FAQ section?
                -- TODO: Include button to reset to default?
                -- TODO: Show different error messages?
                ]
            , a
                [ class "btn u-mt-2"
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
    a [ class "u-ml-half u-primaryColor", href configurationUrl ]
        [ text <|
            helpers.t "Folder Modify"
        ]
