package auth

import (
	"testing"
)

func TestGenerateAndParse(t *testing.T) {
	svc := NewService("test-secret")
	token, err := svc.Generate("admin")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := svc.Parse(token)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if claims.UserID != "admin" {
		t.Fatalf("userID = %s, want admin", claims.UserID)
	}
	if claims.Role != "operator" {
		t.Fatalf("role = %s, want operator", claims.Role)
	}
}

func TestGeneratePair(t *testing.T) {
	svc := NewService("test-secret")
	access, refresh, err := svc.GeneratePair("admin")
	if err != nil {
		t.Fatalf("generate pair failed: %v", err)
	}
	if access == "" || refresh == "" {
		t.Fatal("expected non-empty tokens")
	}

	accClaims, err := svc.Parse(access)
	if err != nil {
		t.Fatalf("parse access failed: %v", err)
	}
	if accClaims.UserID != "admin" || accClaims.TokenType != "access" {
		t.Fatalf("unexpected access claims: %+v", accClaims)
	}

	refClaims, err := svc.ParseRefresh(refresh)
	if err != nil {
		t.Fatalf("parse refresh failed: %v", err)
	}
	if refClaims.UserID != "admin" || refClaims.TokenType != "refresh" {
		t.Fatalf("unexpected refresh claims: %+v", refClaims)
	}
}

func TestParseInvalidToken(t *testing.T) {
	svc := NewService("test-secret")
	_, err := svc.Parse("bad-token")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}

func TestParseRefreshAsAccess(t *testing.T) {
	svc := NewService("test-secret")
	_, refresh, _ := svc.GeneratePair("admin")
	_, err := svc.Parse(refresh)
	if err == nil {
		t.Fatal("expected error when parsing refresh token as access")
	}
}
