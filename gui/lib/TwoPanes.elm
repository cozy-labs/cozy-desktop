module TwoPanes (..) where

import Effects exposing (Effects)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)
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


type Action
  = NoOp
  | GoToTab Tab
  | SetAutoLaunch Bool
  | FillAddress String
  | UnlinkCozy
  | UpdateHelp Help.Action
  | SendMail String
  | Mail (Maybe String)
    -- String is an error
  | Updated
  | Transfer Dashboard.File
  | Remove Dashboard.File
  | SyncError String
  | Tick Time


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToTab tab' ->
      ( { model | tab = tab' }, Effects.none )

    SetAutoLaunch autolaunch ->
      let
        settings' =
          Settings.update (Settings.SetAutoLaunch autolaunch) model.settings

        task =
          Signal.send autoLauncher.address autolaunch

        effect =
          Effects.map (always NoOp) (Effects.task task)
      in
        ( { model | settings = settings' }, effect )

    FillAddress address ->
      let
        account' =
          Account.update (Account.FillAddress address) model.account
      in
        ( { model | account = account' }, Effects.none )

    UnlinkCozy ->
      let
        task =
          Signal.send unlinkCozy.address ()

        effect =
          Effects.map (always NoOp) (Effects.task task)
      in
        ( model, effect )

    UpdateHelp action' ->
      let
        help' =
          Help.update action' model.help
      in
        ( { model | help = help' }, Effects.none )

    SendMail body ->
      let
        help' =
          Help.update Help.SetBusy model.help

        task =
          Signal.send sendMail.address body

        effect =
          Effects.map (always NoOp) (Effects.task task)
      in
        ( { model | help = help' }, effect )

    Mail (Just error) ->
      let
        help' =
          Help.update (Help.SetError error) model.help
      in
        ( { model | help = help' }, Effects.none )

    Mail Nothing ->
      let
        help' =
          Help.update Help.SetSuccess model.help
      in
        ( { model | help = help' }, Effects.none )

    Updated ->
      let
        dashboard' =
          Dashboard.update Dashboard.Updated model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )

    Transfer file ->
      let
        dashboard' =
          Dashboard.update (Dashboard.Transfer file) model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )

    Remove file ->
      let
        dashboard' =
          Dashboard.update (Dashboard.Remove file) model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )

    SyncError error ->
      let
        dashboard' =
          Dashboard.update (Dashboard.SetError error) model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )

    Tick now ->
      let
        dashboard' =
          Dashboard.update (Dashboard.Tick now) model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )


autoLauncher : Signal.Mailbox Bool
autoLauncher =
  Signal.mailbox True


unlinkCozy : Signal.Mailbox ()
unlinkCozy =
  Signal.mailbox ()


mail : Maybe String -> Action
mail =
  Mail


sendMail : Signal.Mailbox String
sendMail =
  Signal.mailbox ""



-- VIEW


view : Signal.Address Action -> Model -> Html
view address model =
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
              , onClick address (GoToTab tab)
              ]
              [ icon iconSize active
              , text title
              ]
          ]

    menu =
      aside
        [ class "two-panes__menu" ]
        [ ul
            []
            [ menu_item "Dashboard" DashboardTab Icons.dashboard
            , menu_item "Settings" SettingsTab Icons.settings
            , menu_item "Account" AccountTab Icons.account
            , menu_item "Help" HelpTab Icons.help
            ]
        ]

    content =
      case model.tab of
        DashboardTab ->
          Dashboard.view model.dashboard

        SettingsTab ->
          let
            context =
              Settings.Context
                (Signal.forwardTo address SetAutoLaunch)
          in
            Settings.view context model.settings

        AccountTab ->
          let
            context =
              Account.Context
                (Signal.forwardTo address (always (UnlinkCozy)))
          in
            Account.view context model.account

        HelpTab ->
          let
            context =
              Help.Context
                (Signal.forwardTo address UpdateHelp)
                (Signal.forwardTo address SendMail)
          in
            Help.view context model.help
  in
    section [ class "two-panes" ] [ menu, content ]
