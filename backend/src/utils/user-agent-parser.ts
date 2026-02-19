export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  }

  const browser = parseBrowser(ua);
  const os = parseOS(ua);
  const device = parseDevice(ua);

  return { browser, os, device };
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/MSIE|Trident/i.test(ua)) return 'IE';
  return 'Unknown';
}

function parseOS(ua: string): string {
  if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  return 'Unknown';
}

function parseDevice(ua: string): string {
  if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) return 'Mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
}
