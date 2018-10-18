#!/usr/bin/env bash

for i in $(seq 1 20); do
	j=$(printf "test/property/local_watcher/generated-%02d.json" "$i")
	./test/generate_property_json.js > "$j"
done
yarn test:property --grep generated
