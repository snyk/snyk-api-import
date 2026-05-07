package internal

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// getDefaultManifestTypes returns the curated default manifest globs to discover common SCM manifest files.
// Decision: include concrete package-manager and container/helm manifests from
// supported-manifests.ts, but avoid very broad globs (like "**/*.yaml" or
// "**/*.json") which cause lots of false positives when scanning repositories.
// Helm-specific files (Chart.yaml, templates/*) are kept because they are
// explicit and useful.
func getDefaultManifestTypes() []string {
	return []string{
		// npm / node
		"**/package.json",
		"package.json",
		// Ruby
		"**/Gemfile.lock",
		"Gemfile.lock",
		// Yarn
		"**/yarn.lock",
		"yarn.lock",
		// Maven / Java
		"**/pom.xml",
		"pom.xml",
		// Gradle
		"**/build.gradle",
		"build.gradle",
		// SBT
		"**/build.sbt",
		"build.sbt",
		// pip / requirements
		"**/*req*.txt",
		"**/requirements/*.txt",
		"requirements.txt",
		// Poetry / pyproject
		"**/pyproject.toml",
		"pyproject.toml",
		// Go (dep / modules)
		"**/Gopkg.lock",
		"Gopkg.lock",
		"**/vendor.json",
		"vendor.json",
		"**/go.mod",
		"go.mod",
		// .NET / NuGet (common project files)
		"**/packages.config",
		"**/*.csproj",
		"**/*.fsproj",
		"**/*.vbproj",
		"**/project.json",
		"**/project.assets.json",
		"**/*.targets",
		"**/*.props",
		"**/packages*.lock.json",
		"**/global.json",
		// Paket
		"**/paket.dependencies",
		// Composer / PHP
		"**/composer.lock",
		"composer.lock",
		// CocoaPods
		"**/Podfile",
		"Podfile",
		// Elixir
		"**/mix.exs",
		"mix.exs",
		// Dockerfile patterns (case-insensitive-ish)
		"**/*[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE]*",
		"**/*Dockerfile*",
		// Common exact Dockerfile names (ensure we match plain 'Dockerfile')
		"Dockerfile",
		"dockerfile",
		// Helm (explicit)
		"Chart.yaml",
		"templates/*.yaml",
		"templates/*.yml",
		// Terraform (explicit)
		"**/*.tf",
	}
}

// isAllowedNextURL validates pagination "next" URLs returned by upstream APIs to
// avoid following arbitrary redirects/URLs (SSRF). It allows only HTTPS URLs
// whose hostname matches allowedHost or a subdomain of it. It also allows relative
// URLs that start with "/" which will be interpreted as relative to the allowedHost.
func isAllowedNextURL(nextURL string, allowedHost string) bool {
	if nextURL == "" {
		return false
	}
	// Allow relative URLs that start with "/" - they're safe as they'll be relative to the API base
	if strings.HasPrefix(nextURL, "/") {
		return true
	}
	u, err := url.Parse(nextURL)
	if err != nil {
		return false
	}
	if u.Scheme != "https" {
		return false
	}
	host := u.Hostname()
	if host == allowedHost || strings.HasSuffix(host, "."+allowedHost) {
		return true
	}
	return false
}

// isValidWorkspaceName validates that a workspace/org name contains only safe characters
// to prevent SSRF and path traversal attacks. This is a wrapper around security.IsValidIdentifier
// for use in sync operations.
func isValidWorkspaceName(name string) bool {
	return security.IsValidIdentifier(name)
}

// deriveManifestProjectTypes inspects manifest filename globs and returns a
// deduplicated slice of Snyk project type strings that correspond to those
// manifest patterns. This keeps manifest globs as the single source of truth
// while producing the project-type names used to filter Snyk projects.
func deriveManifestProjectTypes(globs []string) []string {
	set := map[string]bool{}
	for _, g := range globs {
		lg := strings.ToLower(g)
		switch {
		case strings.Contains(lg, "package.json"):
			set["npm"] = true
		case strings.Contains(lg, "gemfile"):
			set["ruby"] = true
		case strings.Contains(lg, "yarn.lock"):
			set["yarn"] = true
		case strings.Contains(lg, "pom.xml"):
			set["maven"] = true
		case strings.Contains(lg, "build.gradle"):
			set["gradle"] = true
		case strings.Contains(lg, "build.sbt"):
			set["sbt"] = true
		case strings.Contains(lg, "requirements") || strings.Contains(lg, "req*.txt"):
			set["pip"] = true
		case strings.Contains(lg, "pyproject"):
			set["poetry"] = true
		case strings.Contains(lg, "go.mod") || strings.Contains(lg, "gopkg") || strings.Contains(lg, "vendor.json"):
			set["go"] = true
		case strings.Contains(lg, "packages.config") || strings.Contains(lg, ".csproj") || strings.Contains(lg, ".fsproj") || strings.Contains(lg, ".vbproj") || strings.Contains(lg, "project.json") || strings.Contains(lg, "project.assets.json") || strings.Contains(lg, ".targets") || strings.Contains(lg, ".props") || strings.Contains(lg, "global.json"):
			set["nuget"] = true
		case strings.Contains(lg, "paket"):
			set["paket"] = true
		case strings.Contains(lg, "composer.lock"):
			set["composer"] = true
		case strings.Contains(lg, "podfile"):
			set["cocoapods"] = true
		case strings.Contains(lg, "mix.exs"):
			set["elixir"] = true
		case strings.Contains(lg, "dockerfile") || strings.Contains(lg, "[dockerfile]") || strings.Contains(lg, "*dockerfile*"):
			set["docker"] = true
		case strings.Contains(lg, "chart.yaml") || strings.Contains(lg, "templates/"):
			set["helm"] = true
		case strings.Contains(lg, ".tf"):
			set["terraform"] = true
		}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out
}

// escapePathSegments escapes each segment of a path but preserves '/' separators.
func escapePathSegments(p string) string {
	if p == "" {
		return ""
	}
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

// normalizeSnykAttributes normalizes Snyk project attributes to consistent
// branch/manifest values used by the rest of the code. It accepts both
// camelCase and snake_case keys (e.g. targetReference / target_reference,
// targetFile / target_file) and returns a bool `include` which indicates
// whether the project should be included based on manifestTypes filtering.
func normalizeSnykAttributes(attrs map[string]interface{}, name string, manifestTypes []string) (branch, manifest, targetReference string, include bool) {
	include = true
	// targetReference (camelCase) or target_reference (snake_case)
	if v, ok := attrs["targetReference"].(string); ok && v != "" {
		targetReference = v
	}
	if v, ok := attrs["target_reference"].(string); ok && v != "" {
		targetReference = v
	}

	if v, ok := attrs["branch"].(string); ok && v != "" {
		branch = v
	}
	// Prefer targetReference when present
	if branch == "" && targetReference != "" {
		branch = targetReference
	}

	// Manifest extraction: prefer explicit manifest attribute, then targetFile/target_file,
	// then fallback to name after ':' if present.
	if m, ok := attrs["manifest"].(string); ok && m != "" {
		manifest = m
	}
	if manifest == "" {
		if v, ok := attrs["targetFile"].(string); ok && v != "" {
			manifest = v
		}
	}
	if manifest == "" {
		if v, ok := attrs["target_file"].(string); ok && v != "" {
			manifest = v
		}
	}
	if manifest == "" {
		if strings.Contains(name, ":") {
			manifest = strings.SplitN(name, ":", 2)[1]
		}
	}

	// If manifestTypes filter is present and manifest is non-empty, ensure it matches
	if len(manifestTypes) > 0 && manifest != "" {
		matched := false
		for _, mt := range manifestTypes {
			matchPath, _ := doublestar.Match(mt, manifest)
			filename := manifest
			if idx := strings.LastIndex(manifest, "/"); idx != -1 {
				filename = manifest[idx+1:]
			}
			matchFile, _ := doublestar.Match(mt, filename)
			if matchPath || matchFile || manifest == mt || filename == mt {
				matched = true
				break
			}
		}
		if !matched {
			include = false
		}
	}
	return branch, manifest, targetReference, include
}

// isSCAFile checks if a file path is an SCA manifest
// This function is used by all optimized sync implementations for consistent file classification
func isSCAFile(path string) bool {
	lowerPath := strings.ToLower(path)
	lowerFilename := lowerPath
	if idx := strings.LastIndex(lowerPath, "/"); idx != -1 {
		lowerFilename = lowerPath[idx+1:]
	}

	// SCA patterns matching getDefaultManifestTypes()
	scaPatterns := map[string]bool{
		// npm / node
		"package.json":      true,
		"package-lock.json": true,
		// Yarn
		"yarn.lock":      true,
		"pnpm-lock.yaml": true,
		// Go
		"go.mod":      true,
		"go.sum":      true,
		"gopkg.lock":  true,
		"vendor.json": true,
		// Maven / Java
		"pom.xml": true,
		// Gradle
		"build.gradle":     true,
		"build.gradle.kts": true,
		"gradle.lockfile":  true,
		// SBT
		"build.sbt": true,
		// Python
		"requirements.txt": true,
		"pipfile":          true,
		"pipfile.lock":     true,
		"poetry.lock":      true,
		"pyproject.toml":   true,
		// Ruby
		"gemfile":      true,
		"gemfile.lock": true,
		// PHP
		"composer.json": true,
		"composer.lock": true,
		// .NET / NuGet
		"packages.config":     true,
		"project.assets.json": true,
		"project.json":        true,
		// Paket
		"paket.dependencies": true,
		// Rust
		"cargo.toml": true,
		"cargo.lock": true,
		// Elixir
		"mix.exs":  true,
		"mix.lock": true,
		// Dart/Flutter
		"pubspec.yaml": true,
		"pubspec.lock": true,
		// CocoaPods
		"podfile":      true,
		"podfile.lock": true,
		// Swift
		"package.swift": true,
	}

	// Check filename patterns
	if scaPatterns[lowerFilename] {
		return true
	}

	// Check file extensions (.csproj, .fsproj, .vbproj)
	if strings.HasSuffix(lowerFilename, ".csproj") ||
		strings.HasSuffix(lowerFilename, ".vbproj") ||
		strings.HasSuffix(lowerFilename, ".fsproj") {
		return true
	}

	// Check for requirements patterns (*req*.txt, requirements/*.txt)
	if strings.HasSuffix(lowerFilename, ".txt") && strings.Contains(lowerFilename, "req") {
		return true
	}

	return false
}

// isIaCFile checks if a file path is an IaC configuration
// This function is used by all optimized sync implementations for consistent file classification
func isIaCFile(path string) bool {
	lowerPath := strings.ToLower(path)
	lowerFilename := lowerPath
	if idx := strings.LastIndex(lowerPath, "/"); idx != -1 {
		lowerFilename = lowerPath[idx+1:]
	}

	// Exclude CI/CD YAML files - check full path
	if strings.Contains(lowerPath, ".github/") ||
		strings.Contains(lowerPath, ".gitlab/") ||
		strings.Contains(lowerPath, ".circleci/") ||
		strings.Contains(lowerPath, ".travis/") ||
		strings.Contains(lowerPath, ".azure-pipelines/") ||
		strings.Contains(lowerPath, ".buildkite/") {
		return false
	}

	// Terraform files
	if strings.HasSuffix(lowerFilename, ".tf") || strings.HasSuffix(lowerFilename, ".tfvars") {
		return true
	}

	// Helm files
	if lowerFilename == "chart.yaml" || strings.Contains(lowerPath, "templates/") {
		if strings.HasSuffix(lowerFilename, ".yaml") || strings.HasSuffix(lowerFilename, ".yml") {
			return true
		}
	}

	// IaC YAML/JSON files (CloudFormation, Kubernetes, etc.)
	if strings.HasSuffix(lowerFilename, ".yaml") || strings.HasSuffix(lowerFilename, ".yml") || strings.HasSuffix(lowerFilename, ".json") {
		// Include if in IaC-related directories
		if strings.Contains(lowerPath, "k8s") ||
			strings.Contains(lowerPath, "kubernetes") ||
			strings.Contains(lowerPath, "helm") ||
			strings.Contains(lowerPath, "terraform") ||
			strings.Contains(lowerPath, "cloudformation") {
			return true
		}
	}

	return false
}

// isContainerFile checks if a file path is a container configuration
// This function is used by all optimized sync implementations for consistent file classification
func isContainerFile(path string) bool {
	lowerPath := strings.ToLower(path)
	lowerFilename := lowerPath
	if idx := strings.LastIndex(lowerPath, "/"); idx != -1 {
		lowerFilename = lowerPath[idx+1:]
	}

	// Dockerfile patterns (case-insensitive, matching getDefaultManifestTypes())
	if strings.Contains(lowerFilename, "dockerfile") {
		return true
	}

	// Container patterns
	containerPatterns := map[string]bool{
		"containerfile": true,
		".dockerignore": true,
	}

	return containerPatterns[lowerFilename]
}

// isSCAProjectType checks if a Snyk project type is an SCA (Software Composition Analysis) type
func isSCAProjectType(projectType string) bool {
	scaTypes := map[string]bool{
		"npm": true, "yarn": true, "maven": true, "gradle": true,
		"pip": true, "poetry": true, "gomodules": true, "rubygems": true,
		"composer": true, "nuget": true, "paket": true, "golangdep": true,
		"govendor": true, "cocoapods": true, "sbt": true, "hex": true,
		"cargo": true, "pipenv": true,
	}
	return scaTypes[projectType]
}

// isContainerProjectType checks if a Snyk project type is a Container type
func isContainerProjectType(projectType string) bool {
	return projectType == "dockerfile" || projectType == "docker" ||
		projectType == "apk" || projectType == "deb" ||
		projectType == "rpm" || projectType == "linux"
}

// isIaCProjectType checks if a Snyk project type is an IaC (Infrastructure as Code) type
func isIaCProjectType(projectType string) bool {
	return projectType == "terraformconfig" || projectType == "k8sconfig" ||
		projectType == "helmconfig" || projectType == "cloudformationconfig" ||
		projectType == "armconfig"
}

// FilterSnykProjectsByProduct filters Snyk projects by product type (openSource, container, iac)
// This function is used by all optimized sync implementations for consistent product filtering
func FilterSnykProjectsByProduct(projects []map[string]interface{}, product string) []map[string]interface{} {
	if product == "" {
		return projects
	}

	filtered := []map[string]interface{}{}
	for _, p := range projects {
		projectType, ok := p["type"].(string)
		if !ok {
			continue
		}

		switch product {
		case "openSource":
			if isSCAProjectType(projectType) {
				filtered = append(filtered, p)
			}
		case "container":
			if isContainerProjectType(projectType) {
				filtered = append(filtered, p)
			}
		case "iac":
			if isIaCProjectType(projectType) {
				filtered = append(filtered, p)
			}
		}
	}
	return filtered
}

// PerformImportsFunc is a callback function type for integration-specific import logic
type PerformImportsFunc func(context.Context, []map[string]interface{}, string, string) error

// HandleBranchUpdates handles branch updates for Snyk projects with PATCH API and optional fallback
// This function is used by all optimized sync implementations for consistent branch update handling
func HandleBranchUpdates(
	ctx context.Context,
	orgID string,
	branchUpdates []BranchUpdate,
	integrationKey string,
	performImportsFn PerformImportsFunc,
	enableFallback bool,
) error {
	if len(branchUpdates) == 0 {
		return nil
	}

	Logger.Infof("Updating %d project branches via PATCH", len(branchUpdates))

	// Build branch update jobs
	var branchJobs []BranchUpdateJob
	for _, bu := range branchUpdates {
		p := bu.OldSnykProject
		if idv, ok := p["id"]; ok {
			if idStr, ok2 := idv.(string); ok2 && idStr != "" {
				branchJobs = append(branchJobs, BranchUpdateJob{
					ProjectID: idStr,
					OldBranch: bu.OldBranch,
					NewBranch: bu.NewBranch,
				})
			}
		}
	}

	// Execute PATCH updates
	updateRes, updateErr := BulkUpdateProjectBranches(ctx, orgID, branchJobs, false)
	if updateErr != nil {
		Logger.Errorf("Branch update error: %v", updateErr)
	}

	// Log successful updates
	for _, projectID := range updateRes.Success {
		Logger.Infof("Successfully updated project branch: %s", projectID)
	}

	// Handle failed updates with fallback (deactivate + re-import)
	if len(updateRes.Failed) > 0 {
		if enableFallback {
			Logger.Warnf("%d branch updates failed via PATCH, falling back to deactivate + import", len(updateRes.Failed))

			var fallbackImports []map[string]interface{}
			var fallbackDeactivate []string

			// Collect failed projects for deactivation and re-import
			for failedProjectID := range updateRes.Failed {
				for _, bu := range branchUpdates {
					p := bu.OldSnykProject
					if idv, ok := p["id"]; ok {
						if idStr, ok2 := idv.(string); ok2 && idStr == failedProjectID {
							fallbackDeactivate = append(fallbackDeactivate, idStr)
							fallbackImports = append(fallbackImports, bu.NewSourceRepo)
							break
						}
					}
				}
			}

			// Deactivate old projects
			if len(fallbackDeactivate) > 0 {
				bdRes, _ := BulkDeactivateProjects(ctx, orgID, fallbackDeactivate, false)
				for _, sid := range bdRes.Success {
					Logger.Infof("Deactivated project (fallback): %s", sid)
				}
			}

			// Re-import with new branch
			if len(fallbackImports) > 0 {
				integrations, err := ListIntegrations(ctx, orgID)
				if err != nil {
					return fmt.Errorf("list integrations for fallback: %w", err)
				}

				integrationID, ok := integrations[integrationKey]
				if !ok {
					return fmt.Errorf("no %s integration found for fallback", integrationKey)
				}

				return performImportsFn(ctx, fallbackImports, orgID, integrationID)
			}
		} else {
			Logger.Warnf("%d branch updates failed via PATCH (fallback disabled, use --enableBranchUpdateFallback to enable)", len(updateRes.Failed))
		}
	}

	return nil
}

// PrintDryRunSummary prints a formatted dry-run summary showing planned actions and performance metrics
// This function is used by all optimized sync implementations for consistent dry-run output
func PrintDryRunSummary(result CompareResult, discoveryDuration, totalDuration time.Duration, source string, additionalMetrics map[string]interface{}) {
	Logger.Infof("\n=== DRY RUN MODE - No changes will be made ===")

	// Print planned imports
	if len(result.Missing) > 0 {
		Logger.Infof("Would import %d new targets:", len(result.Missing))
		for _, m := range result.Missing {
			owner, _ := m["owner"].(string)
			name, _ := m["name"].(string)
			branch, _ := m["branch"].(string)
			manifest, _ := m["manifest"].(string)
			Logger.Infof("  [DRY-RUN] Would import: %s/%s@%s:%s", owner, name, branch, manifest)
		}
	} else {
		Logger.Infof("No new targets to import")
	}

	// Print planned deactivations
	if len(result.Stale) > 0 {
		Logger.Infof("\nWould deactivate %d stale projects:", len(result.Stale))
		for _, s := range result.Stale {
			name, _ := s["name"].(string)
			branch, _ := s["branch"].(string)
			manifest, _ := s["manifest"].(string)
			Logger.Infof("  [DRY-RUN] Would deactivate: %s (branch: %s, manifest: %s)", name, branch, manifest)
		}
	} else {
		Logger.Infof("\nNo stale projects to deactivate")
	}

	// Print planned branch updates
	if len(result.BranchUpdates) > 0 {
		Logger.Infof("\nWould update %d project branches:", len(result.BranchUpdates))
		for _, bu := range result.BranchUpdates {
			name, _ := bu.NewSourceRepo["name"].(string)
			Logger.Infof("  [DRY-RUN] Would update branch %s -> %s for: %s", bu.OldBranch, bu.NewBranch, name)
		}
	} else {
		Logger.Infof("\nNo branch updates needed")
	}

	// Print performance summary
	Logger.Infof("\n=== Performance Summary ===")
	Logger.Infof("Source: %s", source)
	Logger.Infof("Total execution time: %v", totalDuration)
	Logger.Infof("Discovery time: %v (%.1f%%)", discoveryDuration, float64(discoveryDuration)/float64(totalDuration)*100)

	// Print additional metrics if provided
	if additionalMetrics != nil {
		if apiCalls, ok := additionalMetrics["api_calls"].(int); ok {
			Logger.Infof("Total API calls: %d", apiCalls)
		}
		if avgCalls, ok := additionalMetrics["avg_calls_per_workspace"].(float64); ok {
			Logger.Infof("Avg API calls per workspace: %.1f", avgCalls)
		}
		if avgCalls, ok := additionalMetrics["avg_calls_per_org"].(float64); ok {
			Logger.Infof("Avg API calls per org: %.1f", avgCalls)
		}
	}
}
