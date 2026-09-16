package internal

// Test helpers for unit tests in internal package

// ToIfaceMaps converts a slice of map[string]string into []map[string]interface{}
func ToIfaceMaps(src []map[string]string) []map[string]interface{} {
	if src == nil {
		return nil
	}
	out := make([]map[string]interface{}, len(src))
	for i, m := range src {
		nm := make(map[string]interface{})
		for k, v := range m {
			nm[k] = v
		}
		out[i] = nm
	}
	return out
}
