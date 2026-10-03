/**
 * Converts a number to its English word representation.
 * Supports numbers up to 99,99,99,999 (Arab level - Pakistani numbering).
 * Example: 50000 → "Fifty Thousand"
 *          125300 → "One Lakh Twenty Five Thousand Three Hundred"
 */

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigitWords(n) {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? ' ' + ones[o] : '');
}

function threeDigitWords(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let result = '';
  if (h > 0) {
    result = ones[h] + ' Hundred';
    if (rest > 0) result += ' ';
  }
  if (rest > 0) {
    result += twoDigitWords(rest);
  }
  return result;
}

/**
 * Convert a numeric amount to words.
 * Uses Pakistani/South-Asian grouping: Crore, Lakh, Thousand, Hundred.
 * @param {number|string} value - The amount to convert
 * @returns {string} - The amount in words, or empty string if invalid
 */
export function numberToWords(value) {
  const num = Math.floor(Math.abs(Number(value)));
  if (!Number.isFinite(num) || num === 0) return '';

  if (num > 9999999999) return 'Amount too large';

  const parts = [];

  // Arab (1,00,00,00,000)
  const arab = Math.floor(num / 1000000000);
  if (arab > 0) parts.push(threeDigitWords(arab) + ' Arab');

  // Crore (1,00,00,000)
  const crore = Math.floor((num % 1000000000) / 10000000);
  if (crore > 0) parts.push(twoDigitWords(crore) + ' Crore');

  // Lakh (1,00,000)
  const lakh = Math.floor((num % 10000000) / 100000);
  if (lakh > 0) parts.push(twoDigitWords(lakh) + ' Lakh');

  // Thousand (1,000)
  const thousand = Math.floor((num % 100000) / 1000);
  if (thousand > 0) parts.push(twoDigitWords(thousand) + ' Thousand');

  // Hundred + remainder
  const remainder = num % 1000;
  if (remainder > 0) parts.push(threeDigitWords(remainder));

  let result = parts.join(' ');

  // Add "Rupees" suffix
  result += ' Rupees';

  // If original was negative
  if (Number(value) < 0) {
    result = 'Minus ' + result;
  }

  return result;
}

export default numberToWords;
