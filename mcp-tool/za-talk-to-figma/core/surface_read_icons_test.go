package core

import "testing"

func TestLooksLikeIconComponent(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"icon/search", true},
		{"icons/arrow-right", true},
		{"ic_close", true},
		{"ic-home", true},
		{"search_icon", true},
		{"search-icon", true},
		{"search icon", true},
		{"search/icon", true},
		{"icon", true},
		// should NOT match
		{"iconography", false},
		{"biography", false},
		{"button/primary", false},
		{"input/default", false},
		{"typography", false},
	}
	for _, tc := range cases {
		got := looksLikeIconComponent(tc.name)
		if got != tc.want {
			t.Errorf("looksLikeIconComponent(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestNormalizeIconSemanticName(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"icon/search", "search"},
		{"icons/arrow-right", "arrow-right"},
		{"ic_close", "close"},
		{"ic-home", "home"},
		{"search_icon", "search"},
		{"search-icon", "search"},
		{"search icon", "search"},
		{"icon/arrow right 24px", "arrow-right"},
		{"ic_arrow_right_24", "arrow-right"},
		// normalizeIconSemanticName receives already-lowercased strings
		{"icon/close 24", "close"},
		// size annotations stripped
		{"ic_search_16dp", "search"},
		{"icon/plus-24", "plus"},
		// separator normalisation
		{"icon/user.profile", "user-profile"},
		// bare "icon" has no semantic suffix — returned as-is
		{"icon", "icon"},
	}
	for _, tc := range cases {
		got := normalizeIconSemanticName(tc.input)
		if got != tc.want {
			t.Errorf("normalizeIconSemanticName(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestNormalizeSeps(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"zdc_ic", "zdc-ic"},
		{"ZDC_IC/Home", "zdc-ic-home"},
		{"mat_icon/search", "mat-icon-search"},
		{"icon/close 24", "icon-close-24"},
		{"my.icon", "my-icon"},
	}
	for _, tc := range cases {
		got := normalizeSeps(tc.input)
		if got != tc.want {
			t.Errorf("normalizeSeps(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestScanIconComponentsFilterMode(t *testing.T) {
	// Verify that the nameFilter bypass strips the filter prefix from semantic keys.
	// We simulate this by calling the semantic-stripping logic directly.
	cases := []struct {
		compName   string
		nameFilter string
		wantKey    string
	}{
		{"zdc_ic/home_24", "zdc_ic", "home"},
		{"zdc_ic/search_16", "zdc_ic", "search"},
		{"zdc_ic/arrow_right_24", "zdc_ic", "arrow-right"},
		{"mat_icon/close", "mat_icon", "close"},
		// filter doesn't match → empty (would be filtered out in real call)
		{"button/primary", "zdc_ic", ""},
	}
	for _, tc := range cases {
		lower := tc.compName
		normFilter := normalizeSeps(tc.nameFilter)
		normName := normalizeSeps(lower)
		if !contain(normName, normFilter) {
			if tc.wantKey != "" {
				t.Errorf("expected %q to match filter %q", tc.compName, tc.nameFilter)
			}
			continue
		}
		raw := normalizeIconSemanticName(lower)
		semantic := trimPrefixSeg(raw, normFilter)
		if semantic != tc.wantKey {
			t.Errorf("filterMode(%q, %q): semantic = %q, want %q", tc.compName, tc.nameFilter, semantic, tc.wantKey)
		}
	}
}

func contain(s, sub string) bool {
	return len(sub) > 0 && len(s) >= len(sub) && (s == sub || len(s) > 0 && containStr(s, sub))
}

func containStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func trimPrefixSeg(raw, normFilter string) string {
	s := raw
	s2 := s
	if len(s) > len(normFilter) && s[:len(normFilter)] == normFilter {
		s2 = s[len(normFilter):]
		s2 = func(v string) string {
			for len(v) > 0 && v[0] == '-' {
				v = v[1:]
			}
			return v
		}(s2)
	}
	if s2 == "" {
		return raw
	}
	return s2
}

func TestIntentToTitle(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"register-account", "Register Account"},
		{"home_screen", "Home Screen"},
		{"login", "Login"},
		{"product detail page", "Product Detail Page"},
		{"", ""},
	}
	for _, tc := range cases {
		got := intentToTitle(tc.input)
		if got != tc.want {
			t.Errorf("intentToTitle(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}
