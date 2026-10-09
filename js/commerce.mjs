export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function validateProduct(input) {
  const name = String(input.name || '').trim();
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  const returnDays = Number(input.returnDays || 0);
  if (!name || name.length > 160) throw new Error('Enter a product name of 1–160 characters.');
  if (String(input.price).trim() === '' || !Number.isFinite(price) || price < 0) throw new Error('Enter a valid non-negative price.');
  if (String(input.quantity).trim() === '' || !Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Stock must be a whole number of zero or more.');
  if (!Number.isSafeInteger(returnDays) || returnDays < 0) throw new Error('Return days must be a whole number of zero or more.');
  return {name,price:Math.round(price*100)/100,quantity,returnDays,description:String(input.description || '').trim(),category:String(input.category || '').trim().slice(0,60),featured:input.featured === true};
}
export function normalizeCart(value) {
  let items;
  try { items = typeof value === 'string' ? JSON.parse(value) : value; } catch { return []; }
  if (!Array.isArray(items)) return [];
  const unique = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.includes('/')) continue;
    const quantity = Number(item.quantity ?? 1), price = Number(item.price);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999 || !Number.isFinite(price) || price < 0) continue;
    if (unique.has(item.id)) unique.get(item.id).quantity = Math.min(9999,unique.get(item.id).quantity + quantity);
    else unique.set(item.id,{...item,quantity,price});
  }
  return [...unique.values()];
}
export function discountFor(code, subtotal, uid, now = Date.now()) {
  if (!code) return 0;
  if (code.status === 'disabled') throw new Error('This discount code is disabled.');
  if (code.userUID && code.userUID !== uid) throw new Error('This discount code belongs to another account.');
  if (code.expiresAt && new Date(code.expiresAt + 'T23:59:59+05:30').getTime() < now) throw new Error('This discount code has expired.');
  if (Number(code.maxUses) > 0 && Number(code.usedCount || 0) >= Number(code.maxUses)) throw new Error('This discount code has reached its usage limit.');
  if (subtotal < Number(code.minOrder || 0)) throw new Error('Your order no longer meets the minimum amount for this code.');
  const amount=Number(code.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !['flat','percent'].includes(code.type) || (code.type==='percent' && amount>100)) throw new Error('This discount code is invalid.');
  return Math.round(Math.min(subtotal,code.type === 'flat' ? amount : subtotal*amount/100)*100)/100;
}
export function canCancel(order) {
  return !['Shipped','Out for Delivery','Delivered','Completed','Cancelled','Cancelled by User'].includes(order.orderStatus || 'Pending');
}
