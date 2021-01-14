module Util.List exposing (..)

import List exposing (..)



{- Intersperse elements of list a within list b.

   If list a is larger than list b then all remaining elements of list a are
   appended at the end of the resulting list.
-}


intersperseList : List a -> List a -> List a
intersperseList a b =
    case ( a, b ) of
        ( e1 :: l1, e2 :: l2 ) ->
            e2 :: e1 :: intersperseList l1 l2

        _ ->
            List.append b a
