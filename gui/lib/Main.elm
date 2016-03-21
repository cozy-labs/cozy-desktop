module Main (..) where

import StartApp
import Html exposing (Html)
import Effects exposing (Effects, Never)
import Task exposing (Task)
import Actions
import Models
import Update
import View


init : ( Models.AppModel, Effects Actions.Action )
init =
  ( Models.initialModel, Effects.none )


app : StartApp.App Models.AppModel
app =
  StartApp.start
    { init = init
    , inputs = []
    , update = Update.update
    , view = View.view
    }


main : Signal Html
main =
  app.html


port runner : Signal (Task Never ())
port runner =
  app.tasks
