using System;

internal static class Program
{
    private static void Main(string[] args)
    {
        if (args.Length > 0)
        {
            Console.WriteLine($"simple-csharp-app arg: {args[0]}");
        }

        Calculate(2, 3);
    }

    static int Calculate(int left, int right)
    {
        int result = left + right;
        Console.WriteLine($"simple-csharp-app result: {result}");
        return result;
    }
}
