package settings

import (
	"strings"
	"testing"
)

func env(m map[string]string) Getter { return func(k string) string { return m[k] } }

func TestLoadAnalytics(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		env     map[string]string
		want    Analytics
		wantErr string
	}{
		{name: "off by default", env: nil, want: Analytics{}},
		{
			name: "plausible",
			env: map[string]string{
				"ANALYTICS_PROVIDER": "Plausible", "ANALYTICS_SCRIPT_URL": "https://plausible.io/js/script.js",
				"ANALYTICS_SITE_ID": "quiz.vukem.com",
			},
			want: Analytics{
				Provider: "plausible", ScriptURL: "https://plausible.io/js/script.js", SiteID: "quiz.vukem.com",
				Origin: "https://plausible.io",
			},
		},
		{
			name: "umami",
			env: map[string]string{
				"ANALYTICS_PROVIDER": "umami", "ANALYTICS_SCRIPT_URL": "https://cloud.umami.is/script.js",
				"ANALYTICS_SITE_ID": "2b7d6a1e-0000-4000-8000-000000000000",
			},
			want: Analytics{
				Provider: "umami", ScriptURL: "https://cloud.umami.is/script.js",
				SiteID: "2b7d6a1e-0000-4000-8000-000000000000", Origin: "https://cloud.umami.is",
			},
		},
		{name: "unknown provider", env: map[string]string{"ANALYTICS_PROVIDER": "ga"}, wantErr: "must be plausible"},
		{
			name: "http script",
			env: map[string]string{
				"ANALYTICS_PROVIDER":   "umami",
				"ANALYTICS_SCRIPT_URL": "http://x.io/s.js",
				"ANALYTICS_SITE_ID":    "x",
			},
			wantErr: "https",
		},
		{
			name:    "missing site id",
			env:     map[string]string{"ANALYTICS_PROVIDER": "umami", "ANALYTICS_SCRIPT_URL": "https://x.io/s.js"},
			wantErr: "SITE_ID",
		},
		{
			name: "site id injection",
			env: map[string]string{
				"ANALYTICS_PROVIDER": "umami", "ANALYTICS_SCRIPT_URL": "https://x.io/s.js",
				"ANALYTICS_SITE_ID": `x"><script>`,
			},
			wantErr: "SITE_ID",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := LoadAnalytics(env(tt.env))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("LoadAnalytics() error = %v, want %q", err, tt.wantErr)
				}

				return
			}

			if err != nil || got != tt.want {
				t.Errorf("LoadAnalytics() = %+v, %v, want %+v", got, err, tt.want)
			}
		})
	}
}

func TestLoadProxy(t *testing.T) {
	t.Parallel()

	p, err := LoadProxy(
		env(map[string]string{"TRUSTED_PROXIES": "10.0.0.0/8, 100.64.0.1 ,::1", "TRUST_FORWARDED_PROTO": "true"}),
	)
	if err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, n := range p.TrustedProxies {
		got = append(got, n.String())
	}

	if strings.Join(got, ",") != "10.0.0.0/8,100.64.0.1/32,::1/128" || !p.TrustForwardedProto {
		t.Errorf("LoadProxy() = %v, %v", got, p.TrustForwardedProto)
	}

	if p, err := LoadProxy(env(nil)); err != nil || len(p.TrustedProxies) != 0 || p.TrustForwardedProto {
		t.Errorf("LoadProxy(empty) = %+v, %v", p, err)
	}

	for _, bad := range []map[string]string{{"TRUSTED_PROXIES": "nope"}, {"TRUST_FORWARDED_PROTO": "maybe"}} {
		if _, err := LoadProxy(env(bad)); err == nil {
			t.Errorf("LoadProxy(%v) = nil error", bad)
		}
	}
}
