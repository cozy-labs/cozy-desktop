#!/bin/bash

if [ "$TRAVIS_PULL_REQUEST" != "false" ]; then
    version=$(git rev-parse --short HEAD);

    comment_body="Available development artifacts for commit $version:\n";
    comment_body+=$(curl -s -u "$BINTRAY_USER:$BINTRAY_API_TOKEN" \
            "https://api.bintray.com/search/file?name=$version-*&subject=$BINTRAY_ORG&repo=$BINTRAY_REPO" \
            | jq -r "map([\"- [\(.name)](\",@uri \"https://dl.bintray.com/$BINTRAY_ORG/$BINTRAY_REPO/\(.path)\",\")\"] | join(\"\")) | join(\"\\\n\")");

    echo "Comment body: $comment_body";

    curl -X POST "https://api.github.com/repos/$TRAVIS_PULL_REQUEST_SLUG/issues/$TRAVIS_PULL_REQUEST/comments" \
         -H "Authorization: token $GH_TOKEN" \
         -H "Content-Type: application/json" \
         -d "{\"body\":\"$comment_body\"}";
fi
