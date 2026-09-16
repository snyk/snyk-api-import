package internal

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/snyk/snyk-api-import/internal/network"
)

func TestFetchSnykProjects_Success(t *testing.T) {
	// Create mock Snyk API server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request
		if r.Header.Get("Authorization") != "test-snyk-token" {
			t.Errorf("Expected Authorization header 'test-snyk-token', got %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Accept") != "application/vnd.api+json" {
			t.Errorf("Expected Accept header 'application/vnd.api+json', got %q", r.Header.Get("Accept"))
		}

		// Return mock projects
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{
			"data": [
				{
					"id": "proj-123",
					"attributes": {
						"name": "owner/repo:package.json",
						"target_reference": "main"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-123",
								"type": "target"
							}
						}
					}
				},
				{
					"id": "proj-456",
					"attributes": {
						"name": "owner/repo:go.mod",
						"target_reference": "develop"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-123",
								"type": "target"
							}
						}
					}
				}
			],
			"jsonapi": {
				"version": "1.0"
			}
		}`))
	}))
	defer srv.Close()

	// Override network client to use test server
	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				// Rewrite URL to test server
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	projects, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

	if err != nil {
		t.Fatalf("FetchSnykProjects() error = %v", err)
	}

	if len(projects) != 2 {
		t.Errorf("Expected 2 projects, got %d", len(projects))
	}

	// Verify first project
	if projects[0]["name"] != "owner/repo:package.json" {
		t.Errorf("Expected first project name 'owner/repo:package.json', got %q", projects[0]["name"])
	}
	if projects[0]["branch"] != "main" {
		t.Errorf("Expected first project branch 'main', got %q", projects[0]["branch"])
	}

	// Verify second project
	if projects[1]["name"] != "owner/repo:go.mod" {
		t.Errorf("Expected second project name 'owner/repo:go.mod', got %q", projects[1]["name"])
	}
	if projects[1]["branch"] != "develop" {
		t.Errorf("Expected second project branch 'develop', got %q", projects[1]["branch"])
	}
}

func TestFetchSnykProjects_Pagination(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)

		if callCount == 1 {
			// First page with next link
			_, _ = w.Write([]byte(`{
				"data": [
					{
						"id": "proj-1",
						"attributes": {
							"name": "repo1:package.json",
							"target_reference": "main"
						},
						"relationships": {
							"target": {
								"data": {
									"id": "target-1",
									"type": "target"
								}
							}
						}
					}
				],
				"links": {
					"next": "/rest/orgs/test-org-id/projects?version=2025-09-28&starting_after=proj-1"
				}
			}`))
		} else {
			// Second page without next link
			_, _ = w.Write([]byte(`{
				"data": [
					{
						"id": "proj-2",
						"attributes": {
							"name": "repo2:go.mod",
							"target_reference": "develop"
						},
						"relationships": {
							"target": {
								"data": {
									"id": "target-2",
									"type": "target"
								}
							}
						}
					}
				]
			}`))
		}
	}))
	defer srv.Close()

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	projects, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

	if err != nil {
		t.Fatalf("FetchSnykProjects() error = %v", err)
	}

	if len(projects) != 2 {
		t.Errorf("Expected 2 projects across pages, got %d", len(projects))
	}

	if callCount != 2 {
		t.Errorf("Expected 2 API calls (pagination), got %d", callCount)
	}
}

func TestFetchSnykProjects_RateLimiting(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			// First attempt: rate limit
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"message":"Rate limit exceeded"}`))
			return
		}
		// Second attempt: success
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{
			"data": [
				{
					"id": "proj-1",
					"attributes": {
						"name": "repo:package.json",
						"target_reference": "main"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-1",
								"type": "target"
							}
						}
					}
				}
			]
		}`))
	}))
	defer srv.Close()

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	projects, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

	if err != nil {
		t.Fatalf("FetchSnykProjects() should retry on 429, error = %v", err)
	}

	if len(projects) != 1 {
		t.Errorf("Expected 1 project after retry, got %d", len(projects))
	}

	if attempts != 2 {
		t.Errorf("Expected 2 attempts (1 rate limit + 1 success), got %d", attempts)
	}
}

func TestFetchSnykProjects_ErrorHandling(t *testing.T) {
	// Use fast retry config for tests
	restore := SetDefaultRetryConfig(TestRetryConfig())
	defer restore()

	tests := []struct {
		name            string
		statusCode      int
		responseBody    string
		wantErrContains string
	}{
		{
			name:            "unauthorized",
			statusCode:      401,
			responseBody:    `{"message":"Unauthorized"}`,
			wantErrContains: "unexpected status: 401",
		},
		{
			name:            "forbidden",
			statusCode:      403,
			responseBody:    `{"message":"Forbidden"}`,
			wantErrContains: "unexpected status: 403",
		},
		{
			name:            "not found",
			statusCode:      404,
			responseBody:    `{"message":"Organization not found"}`,
			wantErrContains: "org not found or no projects (404)",
		},
		{
			name:            "server error",
			statusCode:      500,
			responseBody:    `{"message":"Internal server error"}`,
			wantErrContains: "max retries exceeded", // 500 is retried, eventually fails
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				_, _ = w.Write([]byte(tt.responseBody))
			}))
			defer srv.Close()

			restore := network.SetTestClient(func() network.Client {
				return &mockHTTPClient{
					doFunc: func(req *http.Request) (*http.Response, error) {
						req.URL.Scheme = "http"
						req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
						return http.DefaultClient.Do(req)
					},
				}
			})
			defer restore()

			ctx := context.Background()
			_, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

			if err == nil {
				t.Errorf("Expected error for status %d, got nil", tt.statusCode)
			} else if !strings.Contains(err.Error(), tt.wantErrContains) {
				t.Errorf("Expected error containing %q, got %q", tt.wantErrContains, err.Error())
			}
		})
	}
}

func TestFetchSnykProjects_ManifestFiltering(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{
			"data": [
				{
					"id": "proj-1",
					"attributes": {
						"name": "repo:package.json",
						"target_reference": "main",
						"target_file": "package.json"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-1",
								"type": "target"
							}
						}
					}
				},
				{
					"id": "proj-2",
					"attributes": {
						"name": "repo:pom.xml",
						"target_reference": "main",
						"target_file": "pom.xml"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-2",
								"type": "target"
							}
						}
					}
				},
				{
					"id": "proj-3",
					"attributes": {
						"name": "repo:go.mod",
						"target_reference": "main",
						"target_file": "go.mod"
					},
					"relationships": {
						"target": {
							"data": {
								"id": "target-3",
								"type": "target"
							}
						}
					}
				}
			]
		}`))
	}))
	defer srv.Close()

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	// Filter for only npm projects
	projects, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", []string{"package.json"})

	if err != nil {
		t.Fatalf("FetchSnykProjects() error = %v", err)
	}

	// Should only return the package.json project
	if len(projects) != 1 {
		t.Errorf("Expected 1 project after filtering, got %d", len(projects))
	}

	if len(projects) > 0 && projects[0]["name"] != "repo:package.json" {
		t.Errorf("Expected filtered project to be 'repo:package.json', got %q", projects[0]["name"])
	}
}

func TestFetchSnykProjects_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{
			"data": []
		}`))
	}))
	defer srv.Close()

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	projects, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

	if err != nil {
		t.Fatalf("FetchSnykProjects() error = %v", err)
	}

	if len(projects) != 0 {
		t.Errorf("Expected 0 projects, got %d", len(projects))
	}
}

func TestFetchSnykProjects_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/vnd.api+json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{invalid json`))
	}))
	defer srv.Close()

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	_, err := FetchSnykProjects(ctx, "test-org-id", "test-snyk-token", nil)

	if err == nil {
		t.Error("Expected error for invalid JSON, got nil")
	}
}

// mockHTTPClient allows custom behavior for testing
type mockHTTPClient struct {
	doFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockHTTPClient) Do(req *http.Request) (*http.Response, error) {
	if m.doFunc != nil {
		return m.doFunc(req)
	}
	return nil, fmt.Errorf("mock client: no doFunc defined")
}
