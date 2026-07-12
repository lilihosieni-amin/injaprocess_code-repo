# Scheduled data-repo push (ARD §15, NFR-7). Alpine + busybox crond.
FROM alpine:3.20
RUN apk add --no-cache git openssh-client
COPY deploy/git-push/git-push-if-needed.sh /usr/local/bin/git-push-if-needed.sh
COPY deploy/git-push/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/git-push-if-needed.sh
# data-repo bind-mounted at /data; deploy key mounted read-only at /keys/id_deploy
CMD ["crond", "-f", "-l", "8"]
