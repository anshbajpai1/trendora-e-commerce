const response = await fetch("https://xgcuvjabxldaikdebztx.supabase.co/functions/v1/send-notification", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    to: process.argv[2] || "customer@example.com",
    type: "order-confirmation",
    payload: {
      order: {
        id: "TEST123",
        customerName: "Test Customer",
        address: "Test address",
        items: [{ name: "Trendora Test Product", quantity: 1, price: 999 }],
        totalAmount: 999,
        paymentMethod: "COD",
        paymentStatus: "Pending",
        orderDateTime: new Date().toLocaleString("en-IN")
      }
    }
  })
});

const result = await response.json();
console.log(result);
