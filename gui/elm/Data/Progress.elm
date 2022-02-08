module Data.Progress exposing
    ( EncodedProgress
    , Progress
    , decode
    , done
    , ratio
    )

import Data.Bytes as Bytes exposing (Bytes)


type alias Progress =
    { total : Bytes
    , transferred : Bytes
    }


done : Progress -> Bool
done { total, transferred } =
    let
        order =
            Bytes.compare transferred total
    in
    order == EQ || order == GT


ratio : Progress -> Float
ratio { total, transferred } =
    Bytes.toFloat transferred / Bytes.toFloat total


type alias EncodedProgress =
    { total : Int
    , transferred : Int
    }


decode : EncodedProgress -> Progress
decode { total, transferred } =
    Progress (Bytes.fromInt total) (Bytes.fromInt transferred)
