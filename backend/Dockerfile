FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/backend ./cmd/backend

FROM golang:1.25-alpine
WORKDIR /app
RUN adduser -D -u 10001 appuser
COPY --from=builder /out/backend /app/backend
COPY migrations /app/migrations
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["/app/backend"]
