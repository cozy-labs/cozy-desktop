module Util.Conditional exposing (viewIf)

import Html exposing (Html, text)


viewIf : Bool -> Html msg -> Html msg
viewIf condition content =
    if condition then
        content

    else
        text ""
