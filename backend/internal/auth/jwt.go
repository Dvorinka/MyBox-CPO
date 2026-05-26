package auth

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrInvalidType  = errors.New("invalid token type")
)

// Claims embedded in every JWT.
type Claims struct {
	UserID    string `json:"sub"`
	Role      string `json:"role"`
	TokenType string `json:"type"`
	jwt.RegisteredClaims
}

// Service handles JWT creation and validation.
type Service struct {
	secret          []byte
	issuer          string
	accessDuration  time.Duration
	refreshDuration time.Duration
}

func NewService(secret string) Service {
	return Service{
		secret:          []byte(secret),
		issuer:          "mybox-cpo",
		accessDuration:  1 * time.Hour,
		refreshDuration: 7 * 24 * time.Hour,
	}
}

func (s Service) generateToken(userID, tokenType string, duration time.Duration) (string, error) {
	claims := Claims{
		UserID:    userID,
		Role:      "operator",
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(duration)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// Generate creates a new access token for the given user (legacy alias).
func (s Service) Generate(userID string) (string, error) {
	return s.generateToken(userID, "access", s.accessDuration)
}

// GeneratePair creates a new access and refresh token pair.
func (s Service) GeneratePair(userID string) (accessToken, refreshToken string, err error) {
	accessToken, err = s.generateToken(userID, "access", s.accessDuration)
	if err != nil {
		return "", "", err
	}
	refreshToken, err = s.generateToken(userID, "refresh", s.refreshDuration)
	if err != nil {
		return "", "", err
	}
	return accessToken, refreshToken, nil
}

// parse validates a token string and returns its claims with optional type check.
func (s Service) parse(tokenStr, expectedType string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	if expectedType != "" && claims.TokenType != expectedType {
		return nil, ErrInvalidType
	}
	return claims, nil
}

// Parse validates an access token string and returns its claims.
func (s Service) Parse(tokenStr string) (*Claims, error) {
	return s.parse(tokenStr, "access")
}

// ParseRefresh validates a refresh token string and returns its claims.
func (s Service) ParseRefresh(tokenStr string) (*Claims, error) {
	return s.parse(tokenStr, "refresh")
}

// extractToken reads the access token from cookie or Authorization header.
func (s Service) extractToken(c *gin.Context) string {
	if cookie, err := c.Cookie("access_token"); err == nil && cookie != "" {
		return cookie
	}
	header := c.GetHeader("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return ""
	}
	return parts[1]
}

// Middleware returns a Gin middleware that checks access token in cookie or Authorization header.
// On success it stores claims in the context under key "authClaims".
func (s Service) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := s.extractToken(c)
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			return
		}
		claims, err := s.Parse(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		c.Set("authClaims", claims)
		c.Next()
	}
}
