#!/usr/bin/env bash
set -e

for i in $(seq 1 100); do
	for property in local_watcher two_clients; do
		name=$(printf "test/property/%s/generated-%03d.json" "$property" "$i")
		./test/generate_property_json.js > "$name"
		yarn test:property --grep "$(basename "$name")"
	done
done
