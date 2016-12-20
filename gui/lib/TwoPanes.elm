module TwoPanes exposing (..)

import Html exposing (..)
import Html.App as Html
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)
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


init : String -> Model
init version =
    { tab = DashboardTab
    , dashboard = Dashboard.init
    , settings = Settings.init version
    , account = Account.init
    , help = Help.init
    }



-- UPDATE


type Msg
    = NoOp
    | GoToTab Tab
    | GoToStrTab String
    | FillAddressAndDevice ( String, String )
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg
    | AccountMsg Account.Msg
    | HelpMsg Help.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        GoToTab tab_ ->
            let
                dashboard =
                    model.dashboard

                newDashboard =
                    { dashboard | page = 1 }
            in
                ( { model | tab = tab_, dashboard = newDashboard }, Cmd.none )

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

        FillAddressAndDevice info ->
            let
                ( account, _ ) =
                    Account.update (Account.FillAddressAndDevice info) model.account
            in
                ( { model | account = account }, Cmd.none )

        DashboardMsg subMsg ->
            let
                dashboard =
                    Dashboard.update subMsg model.dashboard
            in
                ( { model | dashboard = dashboard }, Cmd.none )

        SettingsMsg subMsg ->
            let
                ( settings, cmd ) =
                    Settings.update subMsg model.settings
            in
                ( { model | settings = settings }, Cmd.map SettingsMsg cmd )

        AccountMsg subMsg ->
            let
                ( account, cmd ) =
                    Account.update subMsg model.account
            in
                ( { model | account = account }, Cmd.map AccountMsg cmd )

        HelpMsg subMsg ->
            let
                ( help, cmd ) =
                    Help.update subMsg model.help
            in
                ( { model | help = help }, Cmd.map HelpMsg cmd )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        iconSize =
            20

        menu_item title tab icon =
            let
                active =
                    model.tab == tab

                translated =
                    helpers.t ("TwoPanes " ++ title)
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
                        , text translated
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
                    Html.map DashboardMsg (Dashboard.view helpers model.dashboard)

                SettingsTab ->
                    Html.map SettingsMsg (Settings.view helpers model.settings)

                AccountTab ->
                    Html.map AccountMsg (Account.view helpers model.account)

                HelpTab ->
                    Html.map HelpMsg (Help.view helpers model.help)
    in
        section [ class "two-panes" ] [ menu, content ]
