package main

import "fmt"

func calculate(left, right int) int {
	result := left + right
	fmt.Printf("Result: %d\n", result)
	return result
}

func main() {
	calculate(2, 3)
}