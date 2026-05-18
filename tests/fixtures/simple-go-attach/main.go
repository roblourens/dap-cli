package main

import (
	"fmt"
	"time"
)

func calculate(left, right int) int {
	result := left + right
	fmt.Printf("Attach result: %d\n", result)
	return result
}

func main() {
	fmt.Println("simple-go-attach ready")
	for {
		calculate(7, 8)
		time.Sleep(250 * time.Millisecond)
	}
}