module Main (..) where

import StartApp
import Html exposing (Html)
import Effects exposing (Effects, Never)
import Task exposing (Task)
import Wizard


init : ( Wizard.Model, Effects Wizard.Action )
init =
  ( Wizard.init, Effects.none )


app : StartApp.App Wizard.Model
app =
  StartApp.start
    { init = init
    , inputs = []
    , update = Wizard.update
    , view = Wizard.view
    }


main : Signal Html
main =
  app.html


port runner : Signal (Task Never ())
port runner =
  app.tasks
