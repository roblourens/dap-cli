using System;
using System.Threading;

internal static class Program
{
    private static void Main()
    {
        Console.WriteLine("simple-csharp-attach ready");

        while (true)
        {
            Calculate(21, 34);
            Thread.Sleep(250);
        }
    }

    static int Calculate(int left, int right)
    {
        int result = left + right;
        Console.WriteLine($"simple-csharp-attach result: {result}");
        return result;
    }
}
