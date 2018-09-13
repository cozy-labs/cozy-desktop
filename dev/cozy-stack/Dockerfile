# Use explicit tag (not latest which doesn't necessarily mean the last stable
# version of the image)
FROM cozy/cozy-app-dev:2018M3S6

# Bring back git so we can install Cozy apps later
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends git

# Use custom Docker entrypoint to install apps on running cozy-stack
COPY ./cozy-desktop-entrypoint.sh /cozy-desktop-entrypoint.sh
RUN chmod +x /cozy-desktop-entrypoint.sh
ENTRYPOINT ["/cozy-desktop-entrypoint.sh"]
