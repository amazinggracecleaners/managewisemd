export function getDeviceInfo() {
  if (typeof window === "undefined") {
    return {
      deviceLabel: "Unknown device",
      deviceDetails: "",
    };
  }

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const language = navigator.language || "";

  let deviceType = "Desktop";
  if (/iPad|Tablet/i.test(ua)) {
    deviceType = "Tablet";
  } else if (/Mobi|Android|iPhone|iPod/i.test(ua)) {
    deviceType = "Mobile";
  }

  let browser = "Unknown Browser";
  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";

  return {
    deviceLabel: `${deviceType} • ${browser} • ${os}`,
    deviceDetails: `platform=${platform}; language=${language}; ua=${ua}`,
  };
}