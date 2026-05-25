FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/station ./cmd/station

FROM golang:1.25-alpine
WORKDIR /app
RUN adduser -D -u 10001 appuser
COPY --from=builder /out/station /app/station
USER appuser
CMD ["/app/station"]
