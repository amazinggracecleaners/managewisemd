export function getDeviceLabel() {
  if (typeof navigator === "undefined") return "Unknown device";

  const ua = navigator.userAgent || "";

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const deviceType = isMobile ? "Mobile" : "Desktop";

  let browser = "Unknown Browser";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${deviceType} • ${browser} • ${os}`;
}