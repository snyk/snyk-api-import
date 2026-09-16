package internal

// CompareResult is the result of comparing source control and Snyk states.
type CompareResult struct {
	Missing         []map[string]interface{} // Repos in source control but not in Snyk
	Stale           []map[string]interface{} // Projects in Snyk but not in source control
	ImportableEmpty []map[string]interface{} // Missing repos with no manifest files
	BranchUpdates   []BranchUpdate           // Projects where the default branch changed
}

// BranchUpdate represents a project where the default branch changed in source control
type BranchUpdate struct {
	OldSnykProject map[string]interface{} // The existing Snyk project (to deactivate)
	NewSourceRepo  map[string]interface{} // The new source repo state (to import)
	OldBranch      string
	NewBranch      string
}
