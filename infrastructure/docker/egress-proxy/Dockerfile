# praxis-egress — the sandbox outbound allowlist proxy (ADR-0021 / STORY-19).
# A tiny default-deny forward proxy: sandboxes (on the internal praxis-sandbox-net)
# reach the internet only through here, and only for the allowlisted domains.
FROM alpine:3.20

RUN apk add --no-cache tinyproxy curl

COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
COPY allowlist /etc/tinyproxy/allowlist

EXPOSE 3128

# -d runs tinyproxy in the foreground (no daemonize) so it's the container's PID 1.
ENTRYPOINT ["tinyproxy", "-d", "-c", "/etc/tinyproxy/tinyproxy.conf"]
