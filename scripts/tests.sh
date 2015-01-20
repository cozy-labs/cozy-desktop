#!/bin/sh

export DEBUG=true 
export DEFAULT_DIR=tests 

BIN='mocha --reporter spec --compilers coffee:coffee-script/register '

$BIN tests/functional/remote.coffee
$BIN tests/functional/local.coffee
$BIN tests/functional/local_change.coffee

$BIN tests/operations/
