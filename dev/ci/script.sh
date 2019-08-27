#!/bin/bash

set -ex

if [ "$JOB" == "unit" ]; then
    . "./dev/ci/tests.sh"
elif [ "$JOB" == "scenarios" ]; then
    . "./dev/ci/scenarios.sh"
elif [ "$JOB" == "stopped_scenarios" ]; then
    STOPPED_CLIENT=1 . "./dev/ci/scenarios.sh"
elif [ "$JOB" == "dist" ]; then
    . "./dev/ci/dist.sh"
fi
