/** Best-effort desktop notification (useful when Generate runs for minutes in a background tab). */
export async function notifyCompletion(title: string, body: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;

    const notification = new Notification(title, {
      body,
      icon: "/cubi-icon.png",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Ignore — toast still covers the in-app case.
  }
}
