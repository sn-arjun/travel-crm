/**
 * Where a phone number is (R305): the country it belongs to and whether it is a premium or satellite number.
 * Pure functions, no database. Used by the fraud preflight (before a call is placed) and by usage metering
 * (to price a minute by its destination).
 *
 * The country comes from the calling code (longest match). The premium list is static on purpose: premium-rate,
 * satellite and "international network" prefixes are blocked outright, whatever the agency's allow-list says.
 */

/** Calling code -> ISO 3166 alpha-2 (the main countries; shared codes such as +1 and +7 get their main country). */
const CALLING_CODES: Record<string, string> = {
  '1': 'US', '7': 'RU', '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR', '34': 'ES', '36': 'HU', '39': 'IT',
  '40': 'RO', '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE',
  '51': 'PE', '52': 'MX', '53': 'CU', '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO', '58': 'VE',
  '60': 'MY', '61': 'AU', '62': 'ID', '63': 'PH', '64': 'NZ', '65': 'SG', '66': 'TH',
  '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN', '90': 'TR', '91': 'IN', '92': 'PK', '93': 'AF', '94': 'LK', '95': 'MM', '98': 'IR',
  '212': 'MA', '213': 'DZ', '216': 'TN', '218': 'LY', '220': 'GM', '221': 'SN', '224': 'GN', '225': 'CI', '227': 'NE', '229': 'BJ',
  '230': 'MU', '231': 'LR', '232': 'SL', '233': 'GH', '234': 'NG', '235': 'TD', '236': 'CF', '237': 'CM', '238': 'CV', '239': 'ST',
  '240': 'GQ', '241': 'GA', '243': 'CD', '244': 'AO', '245': 'GW', '248': 'SC', '249': 'SD', '250': 'RW', '251': 'ET', '252': 'SO',
  '253': 'DJ', '254': 'KE', '255': 'TZ', '256': 'UG', '257': 'BI', '258': 'MZ', '260': 'ZM', '261': 'MG', '262': 'RE', '263': 'ZW',
  '264': 'NA', '265': 'MW', '266': 'LS', '267': 'BW', '268': 'SZ', '269': 'KM',
  '350': 'GI', '351': 'PT', '352': 'LU', '353': 'IE', '354': 'IS', '355': 'AL', '356': 'MT', '357': 'CY', '358': 'FI', '359': 'BG',
  '370': 'LT', '371': 'LV', '372': 'EE', '373': 'MD', '374': 'AM', '375': 'BY', '376': 'AD', '377': 'MC', '380': 'UA', '381': 'RS',
  '385': 'HR', '386': 'SI', '387': 'BA', '420': 'CZ', '421': 'SK', '423': 'LI',
  '500': 'FK', '501': 'BZ', '502': 'GT', '503': 'SV', '504': 'HN', '505': 'NI', '506': 'CR', '507': 'PA', '591': 'BO', '593': 'EC',
  '595': 'PY', '598': 'UY',
  '670': 'TL', '673': 'BN', '674': 'NR', '675': 'PG', '676': 'TO', '677': 'SB', '678': 'VU', '679': 'FJ', '682': 'CK', '685': 'WS',
  '686': 'KI', '688': 'TV', '691': 'FM', '692': 'MH',
  '850': 'KP', '852': 'HK', '853': 'MO', '855': 'KH', '856': 'LA', '880': 'BD', '886': 'TW',
  '960': 'MV', '961': 'LB', '962': 'JO', '963': 'SY', '964': 'IQ', '965': 'KW', '966': 'SA', '967': 'YE', '968': 'OM', '970': 'PS',
  '971': 'AE', '972': 'IL', '973': 'BH', '974': 'QA', '975': 'BT', '976': 'MN', '977': 'NP', '992': 'TJ', '993': 'TM', '994': 'AZ',
  '995': 'GE', '996': 'KG', '998': 'UZ',
};

/** Canadian area codes (the +1 plan is shared with the US). */
const CANADIAN_AREA_CODES = new Set([
  '204', '226', '236', '249', '250', '263', '289', '306', '343', '354', '365', '367', '368', '382', '403', '416', '418', '428', '431', '437', '438',
  '450', '506', '514', '519', '548', '579', '581', '584', '587', '604', '613', '639', '647', '672', '705', '709', '742', '778', '780', '782', '807',
  '819', '825', '867', '873', '879', '902', '905',
]);

/**
 * Prefixes (digits after the +) that are never dialled: premium-rate, satellite and "international network" ranges,
 * and the area codes in the shared +1 plan that are really Caribbean toll-fraud destinations. A number starting with
 * any of them is refused whatever the agency's country allow-list says.
 */
export const BLOCKED_PREFIXES: ReadonlyArray<{ prefix: string; why: string }> = [
  { prefix: '870', why: 'satellite (Inmarsat)' },
  { prefix: '871', why: 'satellite (Inmarsat)' },
  { prefix: '872', why: 'satellite (Inmarsat)' },
  { prefix: '873', why: 'satellite (Inmarsat)' },
  { prefix: '874', why: 'satellite (Inmarsat)' },
  { prefix: '881', why: 'satellite (global mobile satellite system)' },
  { prefix: '882', why: 'international network numbers' },
  { prefix: '883', why: 'international network numbers' },
  { prefix: '878', why: 'universal personal telecommunications' },
  { prefix: '979', why: 'international premium rate' },
  { prefix: '808', why: 'international shared cost' },
  { prefix: '1900', why: 'US premium rate' },
  { prefix: '1976', why: 'US premium rate' },
  { prefix: '1809', why: 'Caribbean premium-fraud area code' },
  { prefix: '1829', why: 'Caribbean premium-fraud area code' },
  { prefix: '1849', why: 'Caribbean premium-fraud area code' },
  { prefix: '1876', why: 'Caribbean premium-fraud area code' },
  { prefix: '1284', why: 'Caribbean premium-fraud area code' },
  { prefix: '1473', why: 'Caribbean premium-fraud area code' },
  { prefix: '1649', why: 'Caribbean premium-fraud area code' },
  { prefix: '1664', why: 'Caribbean premium-fraud area code' },
  { prefix: '1767', why: 'Caribbean premium-fraud area code' },
  { prefix: '1784', why: 'Caribbean premium-fraud area code' },
  { prefix: '1869', why: 'Caribbean premium-fraud area code' },
  { prefix: '1758', why: 'Caribbean premium-fraud area code' },
  { prefix: '1268', why: 'Caribbean premium-fraud area code' },
  { prefix: '1264', why: 'Caribbean premium-fraud area code' },
  { prefix: '449', why: 'UK premium rate (09)' },
  { prefix: '4470', why: 'UK personal numbers (070)' },
  { prefix: '61190', why: 'Australian premium rate (190x)' },
  { prefix: '651900', why: 'Singapore premium rate (1900)' },
  { prefix: '49900', why: 'German premium rate (0900)' },
  { prefix: '49137', why: 'German mass-traffic numbers (0137)' },
  { prefix: '31900', why: 'Dutch premium rate (0900)' },
  { prefix: '31906', why: 'Dutch premium rate (0906)' },
  { prefix: '31909', why: 'Dutch premium rate (0909)' },
];

export interface DestinationInfo {
  /** The number in digits only, no plus. */
  digits: string;
  /** ISO 3166 alpha-2, or null when the calling code is not known. */
  country: string | null;
  /** The matching blocked prefix, or null for an ordinary number. */
  blocked: { prefix: string; why: string } | null;
}

/** Country and premium status of an E.164 number (anything else gives country null). */
export function classifyDestination(e164: string): DestinationInfo {
  const digits = (e164 || '').replace(/^\+/, '').replace(/\D/g, '');
  const blocked = BLOCKED_PREFIXES.find((b) => digits.startsWith(b.prefix)) ?? null;
  let country: string | null = null;
  for (const len of [3, 2, 1]) {
    const code = digits.slice(0, len);
    if (CALLING_CODES[code]) {
      country = CALLING_CODES[code];
      break;
    }
  }
  if (country === 'US' && digits.startsWith('1') && CANADIAN_AREA_CODES.has(digits.slice(1, 4))) country = 'CA';
  return { digits, country, blocked };
}

export type DestinationType = 'standard' | 'premium' | 'unknown';

export function destinationType(info: DestinationInfo): DestinationType {
  return info.blocked ? 'premium' : info.country ? 'standard' : 'unknown';
}

/** Countries that count as the same calling area for the allow-list (the US and Canada share +1). */
export function allowListMatches(allowed: ReadonlySet<string>, destination: string): boolean {
  if (allowed.has(destination)) return true;
  return (destination === 'US' && allowed.has('CA')) || (destination === 'CA' && allowed.has('US'));
}
