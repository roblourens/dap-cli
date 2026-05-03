def greet(name):
    message = f"Hello, {name}!"
    print(message)
    return message


def calculate(left, right):
    result = left + right
    print(f"Result: {result}")
    return result


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "run":
        greet("World")
        calculate(2, 3)