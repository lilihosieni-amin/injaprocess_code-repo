#!/bin/sh
set -eu

REPO="${DATA_REPO:-/data}"
BRANCH="${GIT_BRANCH:-main}"
KEY="${DEPLOY_KEY:-/keys/id_deploy}"

if [ -f "$KEY" ]; then
    export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

cd "$REPO"
if ! git fetch -q origin "$BRANCH" 2>/dev/null; then
    echo "warning: git fetch failed (check deploy key / network)" >&2
fi
UNPUSHED="$(git rev-list --count "origin/${BRANCH}..${BRANCH}" 2>/dev/null || echo 0)"

if [ "$UNPUSHED" -gt 0 ]; then
    echo "pushing ${UNPUSHED} commit(s)"
    if git push origin "$BRANCH"; then
        echo "push ok"
    else
        echo "push failed" >&2
        exit 1
    fi
else
    echo "nothing to push"
fi
