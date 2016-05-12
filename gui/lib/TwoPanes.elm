port module TwoPanes exposing (..)

import Html exposing (..)
import Html.App as Html
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Dashboard
import Settings
import Account
import Help


-- MODEL


type Tab
    = DashboardTab
    | SettingsTab
    | AccountTab
    | HelpTab


type alias Model =
    { tab : Tab
    , dashboard : Dashboard.Model
    , settings : Settings.Model
    , account : Account.Model
    , help : Help.Model
    }


init : Model
init =
    { tab = DashboardTab
    , dashboard = Dashboard.init
    , settings = Settings.init
    , account = Account.init
    , help = Help.init
    }



-- UPDATE


type Msg
    = NoOp
    | GoToTab Tab
    | GoToStrTab String
    | FillAddress String
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg
    | AccountMsg Account.Msg
    | HelpMsg Help.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        GoToTab tab' ->
            ( { model | tab = tab' }, Cmd.none )

        GoToStrTab tab ->
            case
                tab
            of
                "settings" ->
                    update (GoToTab SettingsTab) model

                "account" ->
                    update (GoToTab AccountTab) model

                "help" ->
                    update (GoToTab HelpTab) model

                _ ->
                    update (GoToTab DashboardTab) model

        FillAddress address ->
            let
                ( account', _ ) =
                    Account.update (Account.FillAddress address) model.account
            in
                ( { model | account = account' }, Cmd.none )

        DashboardMsg msg' ->
            let
                dashboard' =
                    Dashboard.update msg' model.dashboard
            in
                ( { model | dashboard = dashboard' }, Cmd.none )

        SettingsMsg msg' ->
            let
                ( settings', cmd ) =
                    Settings.update msg' model.settings
            in
                ( { model | settings = settings' }, Cmd.map SettingsMsg cmd )

        AccountMsg msg' ->
            let
                ( account', cmd ) =
                    Account.update msg' model.account
            in
                ( { model | account = account' }, Cmd.map AccountMsg cmd )

        HelpMsg msg' ->
            let
                ( help', cmd ) =
                    Help.update msg' model.help
            in
                ( { model | help = help' }, Cmd.map HelpMsg cmd )



-- SUBSCRIPTIONS


port gototab : (String -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ gototab GoToStrTab
        , Sub.map DashboardMsg (Dashboard.subscriptions model.dashboard)
        , Sub.map SettingsMsg (Settings.subscriptions model.settings)
        , Sub.map HelpMsg (Help.subscriptions model.help)
        ]



-- VIEW


view : Model -> Html Msg
view model =
    let
        iconSize =
            20

        menu_item title tab icon =
            let
                active =
                    model.tab == tab
            in
                li
                    [ classList
                        [ ( "two-panes__menu__item", True )
                        , ( "two-panes__menu__item--active", active )
                        ]
                    ]
                    [ a
                        [ href "#"
                        , onClick (GoToTab tab)
                        ]
                        [ icon iconSize active
                        , text title
                        ]
                    ]

        menu =
            aside [ class "two-panes__menu" ]
                [ ul []
                    [ menu_item "Dashboard" DashboardTab Icons.dashboard
                    , menu_item "Settings" SettingsTab Icons.settings
                    , menu_item "Account" AccountTab Icons.account
                    , menu_item "Help" HelpTab Icons.help
                    ]
                ]

        content =
            case model.tab of
                DashboardTab ->
                    Html.map DashboardMsg (Dashboard.view model.dashboard)

                SettingsTab ->
                    Html.map SettingsMsg (Settings.view model.settings)

                AccountTab ->
                    Html.map AccountMsg (Account.view model.account)

                HelpTab ->
                    Html.map HelpMsg (Help.view model.help)
    in
        section [ class "two-panes" ] [ menu, content ]
