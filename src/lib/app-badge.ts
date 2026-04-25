export async function setAppIconBadge(count: number) {
  try {
    if ("setAppBadge" in navigator && count > 0) {
      await (navigator as any).setAppBadge(count);
    } else if ("clearAppBadge" in navigator) {
      await (navigator as any).clearAppBadge();
    }
  } catch (error) {
    console.warn("App badge not supported:", error);
  }
}

export async function clearAppIconBadge() {
  try {
    if ("clearAppBadge" in navigator) {
      await (navigator as any).clearAppBadge();
    }
  } catch (error) {
    console.warn("Clear app badge not supported:", error);
  }
}