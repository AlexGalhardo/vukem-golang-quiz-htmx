// Package settings reads the app-specific environment variables (analytics,
// reverse proxy) and validates them at boot.
package settings

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

// Getter reads one configuration value ("" when unset); vukem's
// app.Source.Get satisfies it.
type Getter func(key string) string

// Analytics configures the cookieless analytics script. The zero value is
// "off".
type Analytics struct {
	Provider  string // "plausible" or "umami"
	ScriptURL string
	SiteID    string
	// Origin is scheme://host of ScriptURL, added to the CSP.
	Origin string
}

// Enabled reports whether a provider is configured.
func (a Analytics) Enabled() bool { return a.Provider != "" }

// Plausible reports whether the provider is Plausible (else Umami).
func (a Analytics) Plausible() bool { return a.Provider == "plausible" }

// LoadAnalytics reads ANALYTICS_PROVIDER, ANALYTICS_SCRIPT_URL and
// ANALYTICS_SITE_ID. A provider without a valid https script URL or a site
// id is an error, so a typo never ships a page that loads an arbitrary
// script or silently drops analytics.
func LoadAnalytics(get Getter) (Analytics, error) {
	a := Analytics{
		Provider:  strings.ToLower(strings.TrimSpace(get("ANALYTICS_PROVIDER"))),
		ScriptURL: strings.TrimSpace(get("ANALYTICS_SCRIPT_URL")),
		SiteID:    strings.TrimSpace(get("ANALYTICS_SITE_ID")),
	}

	switch a.Provider {
	case "":
		return Analytics{}, nil
	case "plausible", "umami":
	default:
		return Analytics{}, fmt.Errorf("ANALYTICS_PROVIDER %q must be plausible, umami or empty", a.Provider)
	}

	u, err := url.Parse(a.ScriptURL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return Analytics{}, errors.New("ANALYTICS_SCRIPT_URL must be an absolute https URL")
	}

	if a.SiteID == "" || strings.ContainsAny(a.SiteID, "\"'<> ") {
		return Analytics{}, errors.New(
			"ANALYTICS_SITE_ID is required and must not contain quotes, spaces or angle brackets",
		)
	}

	a.Origin = u.Scheme + "://" + u.Host

	return a, nil
}

// Proxy describes the reverse proxy in front of the app (Railway's edge).
type Proxy struct {
	// TrustedProxies are the CIDRs whose X-Forwarded-For is honoured.
	TrustedProxies []*net.IPNet
	// TrustForwardedProto treats X-Forwarded-Proto: https as HTTPS (HSTS).
	TrustForwardedProto bool
}

// LoadProxy reads TRUSTED_PROXIES (comma-separated CIDRs or IPs) and
// TRUST_FORWARDED_PROTO (bool). vukem has no environment variables for
// these yet (see framework-feedback/quiz.md).
func LoadProxy(get Getter) (Proxy, error) {
	var p Proxy

	for raw := range strings.SplitSeq(get("TRUSTED_PROXIES"), ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}

		if !strings.Contains(raw, "/") {
			if ip := net.ParseIP(raw); ip != nil && ip.To4() != nil {
				raw += "/32"
			} else {
				raw += "/128"
			}
		}

		_, n, err := net.ParseCIDR(raw)
		if err != nil {
			return Proxy{}, fmt.Errorf("TRUSTED_PROXIES: %w", err)
		}

		p.TrustedProxies = append(p.TrustedProxies, n)
	}

	if v := strings.TrimSpace(get("TRUST_FORWARDED_PROTO")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Proxy{}, fmt.Errorf("TRUST_FORWARDED_PROTO: %w", err)
		}

		p.TrustForwardedProto = b
	}

	return p, nil
}

// DefaultRateLimit is the per-IP budget per minute. A full quiz run is ~2
// requests per question, so 120/min leaves room for fast keyboard users
// while stopping scrapers.
const DefaultRateLimit = 120

// LoadRateLimit reads RATE_LIMIT_PER_MINUTE (requests per IP per minute).
// CI raises it because the whole e2e suite shares one client IP.
func LoadRateLimit(get Getter) (int, error) {
	v := strings.TrimSpace(get("RATE_LIMIT_PER_MINUTE"))
	if v == "" {
		return DefaultRateLimit, nil
	}

	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("RATE_LIMIT_PER_MINUTE %q must be a positive integer", v)
	}

	return n, nil
}
