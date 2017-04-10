FROM golang:1.7.5

RUN go get github.com/cozy/cozy-stack

EXPOSE 8080
EXPOSE 6060

RUN apt-get update && apt-get install -y \
  netcat \
  tree

COPY bootstrap-cozy-desktop.sh /usr/bin/
COPY cozy.yaml /etc/cozy/

ENV COUCH_HOST couch
ENV COUCH_PORT 5984

CMD while ! nc -z couch 5984; do sleep 0.1; done \
  && cozy-stack serve --allow-root
