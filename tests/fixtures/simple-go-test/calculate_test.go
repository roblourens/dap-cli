package simplegotest

import "testing"

func TestCalculate(t *testing.T) {
	left := 4
	right := 6
	result := calculate(left, right)
	if result != 10 {
		t.Fatalf("calculate(%d, %d) = %d, want 10", left, right, result)
	}
}