// Gewähltes Theme vor dem ersten Zeichnen setzen, damit nichts aufblitzt (eigene Datei wegen der Content-Security-Policy).
try {
  var t = localStorage.getItem("bacap.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) { /* kein Speicher, dann eben System-Einstellung */ }
