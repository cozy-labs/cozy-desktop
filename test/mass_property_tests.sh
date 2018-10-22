#!/usr/bin/env bash
set -e

for i in $(seq 1 100); do
	j=$(printf "test/property/local_watcher/generated-%03d.json" "$i")
	./test/generate_property_json.js > "$j"
	yarn test:property --grep "$(basename "$j")"
done
