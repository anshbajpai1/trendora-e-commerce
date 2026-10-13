// Keep this URL pointed to the server that owns the Razorpay secret. Never put
// a Razorpay key secret in browser code.
window.TrendoraPayments = {
  apiUrl: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : ""
};
