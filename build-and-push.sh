#!/bin/bash

# Build and push Docker image for Hypeliza
# Usage: ./build-and-push.sh [registry] [username] [tag]
# Example: ./build-and-push.sh ghcr.io yourusername latest

REGISTRY=${1:-"docker.io"}
USERNAME=${2:-"yourusername"}
TAG=${3:-"latest"}
IMAGE_NAME="hypeliza"

# Full image path
if [ "$REGISTRY" = "docker.io" ]; then
    FULL_IMAGE="$USERNAME/$IMAGE_NAME:$TAG"
else
    FULL_IMAGE="$REGISTRY/$USERNAME/$IMAGE_NAME:$TAG"
fi

echo "🔨 Building Docker image: $FULL_IMAGE"

# Build the image
docker build -t $FULL_IMAGE .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Login to registry
echo "🔐 Logging in to $REGISTRY"
if [ "$REGISTRY" = "ghcr.io" ]; then
    echo "For GitHub Container Registry, use your GitHub username and a Personal Access Token"
    docker login $REGISTRY
elif [ "$REGISTRY" = "docker.io" ]; then
    echo "For Docker Hub, use your Docker Hub credentials"
    docker login
else
    docker login $REGISTRY
fi

if [ $? -ne 0 ]; then
    echo "❌ Login failed"
    exit 1
fi

# Push the image
echo "📤 Pushing image to registry"
docker push $FULL_IMAGE

if [ $? -ne 0 ]; then
    echo "❌ Push failed"
    exit 1
fi

echo "✅ Successfully pushed: $FULL_IMAGE"
echo ""
echo "📝 You can now use this image in your docker-compose.yml:"
echo "    image: $FULL_IMAGE"