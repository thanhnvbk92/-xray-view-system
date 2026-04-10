using System;
using System.Linq;
using System.Text;

namespace XrayCollector.Services
{
    public static class PidMapper
    {
        public static string MapPid(string basePid, int offset, bool increase)
        {
            if (string.IsNullOrEmpty(basePid) || basePid.Length < 6) return basePid;

            string prefix = basePid.Substring(0, basePid.Length - 6);
            string suffix = basePid.Substring(basePid.Length - 6);

            string currentSuffix = suffix;
            int absOffset = Math.Abs(offset);

            for (int i = 0; i < absOffset; i++)
            {
                currentSuffix = increase ? Increment(currentSuffix) : Decrement(currentSuffix);
            }

            return prefix + currentSuffix;
        }

        private static string Increment(string suffix)
        {
            char[] chars = suffix.ToCharArray();
            bool carry = true;

            for (int i = chars.Length - 1; i >= 0 && carry; i--)
            {
                chars[i] = IncrementChar(chars[i], out carry);
            }

            return new string(chars);
        }

        private static string Decrement(string suffix)
        {
            char[] chars = suffix.ToCharArray();
            bool borrow = true;

            for (int i = chars.Length - 1; i >= 0 && borrow; i--)
            {
                chars[i] = DecrementChar(chars[i], out borrow);
            }

            return new string(chars);
        }

        private static char IncrementChar(char c, out bool carry)
        {
            carry = false;
            if (c >= '0' && c <= '8') return (char)(c + 1);
            if (c == '9') { carry = true; return '0'; }
            if (c >= 'A' && c <= 'Y') return (char)(c + 1);
            if (c == 'Z') { carry = true; return 'A'; }
            return c;
        }

        private static char DecrementChar(char c, out bool borrow)
        {
            borrow = false;
            if (c >= '1' && c <= '9') return (char)(c - 1);
            if (c == '0') { borrow = true; return '9'; }
            if (c >= 'B' && c <= 'Z') return (char)(c - 1);
            if (c == 'A') { borrow = true; return 'Z'; }
            return c;
        }
    }
}
