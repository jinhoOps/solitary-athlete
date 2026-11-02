FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG COLLECTOR_VERSION=container
RUN CGO_ENABLED=0 go build -buildvcs=false -trimpath -ldflags="-s -w -X main.version=${COLLECTOR_VERSION}" -o /out/mukmuk-collector ./cmd/mukmuk-collector

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 collector
USER collector
COPY --from=build /out/mukmuk-collector /usr/local/bin/mukmuk-collector
ENTRYPOINT ["mukmuk-collector"]
