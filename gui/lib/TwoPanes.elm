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
  }


init : String -> Model
init version =
  { tab = DashboardTab
  , dashboard = Dashboard.init
  , settings = Settings.init version
  , account = Account.init
  }



-- UPDATE


type Action
  = NoOp
  | GoToTab Tab
  | FillAddress String
  | UnlinkCozy
  | Updated
  | Transfer Dashboard.File
  | Tick Time


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToTab tab' ->
      ( { model | tab = tab' }, Effects.none )

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

    Tick now ->
      let
        dashboard' =
          Dashboard.update (Dashboard.Tick now) model.dashboard
      in
        ( { model | dashboard = dashboard' }, Effects.none )


unlinkCozy : Signal.Mailbox ()
unlinkCozy =
  Signal.mailbox ()



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
          Settings.view model.settings

        AccountTab ->
          let
            context =
              Account.Context
                (Signal.forwardTo address (always (UnlinkCozy)))
          in
            Account.view context model.account

        HelpTab ->
          Help.view
  in
    section [ class "two-panes" ] [ menu, content ]
