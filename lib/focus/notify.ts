/**
 * שליחת התראה: דרך ה-Service Worker כשיש (חובה באנדרואיד — הבנאי
 * new Notification לא נתמך שם), עם נסיגה לבנאי הישיר בדסקטופ.
 */
export async function notify(title: string, body: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body,
    tag: "moked-nag",
    icon: "/icons/moked-192.png",
    badge: "/icons/moked-192.png",
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/focus");
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // ממשיכים לנסיגה
  }
  try {
    new Notification(title, options);
  } catch {
    // דפדפן בלי תמיכה כלל — מוותרים בשקט
  }
}
