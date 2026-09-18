FROM operaton/operaton:2.1.4

# The CIZ case processes are baked into the image so the engine can run in
# Azure Container Apps, where host folder mounts are not available.
# Locally, docker compose mounts processes/ on top of this directory, so
# process changes still apply without rebuilding the image.
COPY . /operaton/configuration/resources
