using System;

internal static class Program
{
    private static void Main()
    {
        Calculate(8, 13);
    }

    static int Calculate(int left, int right)
    {
        int result = left + right;
        Console.WriteLine($"simple-csharp-short-lived result: {result}");
        return result;
    }
}
