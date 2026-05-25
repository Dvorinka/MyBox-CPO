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

func TestParseInvalidToken(t *testing.T) {
	svc := NewService("test-secret")
	_, err := svc.Parse("bad-token")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
