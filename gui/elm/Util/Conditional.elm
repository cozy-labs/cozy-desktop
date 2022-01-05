module Util.Conditional exposing (ShowInWeb, inWeb, onOS, viewIf)

import Html exposing (Html, text)


viewIf : Bool -> Html msg -> Html msg
viewIf condition content =
    if condition then
        content

    else
        text ""



-- Used to decide where to open paths (i.e. either in Drive Web or the local
-- filesystem).


type alias ShowInWeb =
    Bool


inWeb : ShowInWeb
inWeb =
    True


onOS : ShowInWeb
onOS =
    False
